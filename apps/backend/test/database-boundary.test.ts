import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type pg from 'pg';
import { withTenant } from '../src/auth/tenant.js';
import { adminPool, applicationPool } from './database.js';
import { seedTestCompany, type CompanyFixture } from './fixtures.js';

const admin = adminPool();
const app = applicationPool();
let a: CompanyFixture;
let b: CompanyFixture;
before(async () => { a = await seedTestCompany(admin); b = await seedTestCompany(admin); });
after(async () => { await app.end(); await admin.end(); });
const migration = await import(new URL('../../../scripts/database.mjs', import.meta.url).href) as {
  migrate(pool: pg.Pool, role: string): Promise<void>;
  configureApplicationPrivileges(client: pg.PoolClient, role: string): Promise<void>;
  assertApplicationRoleSafe(client: pg.PoolClient, role: string): Promise<void>;
};

test('API用DBユーザーは非所有者でRLSを回避できずDDLと認証秘密を取得できない', async () => {
  const {rows: [privileges]} = await app.query('SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user');
  assert.deepEqual(privileges, {rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false});
  for (const table of ['officers', 'sites', 'duty_slots', 'memberships']) {
    assert.equal((await app.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0);
  }
  for (const table of ['google_identities', 'app_sessions', 'auth_oauth_transactions']) {
    await assert.rejects(app.query(`SELECT * FROM ${table}`), {code: '42501'});
  }
  await assert.rejects(app.query('CREATE TABLE unauthorized_test_table(id integer)'), {code: '42501'});
});

test('会社を設定した接続でも別会社を取得せず再利用接続に会社設定を残さない', async () => {
  await withTenant(app, a.actors.admin.principal, async (connection) => {
    const result = await connection.query('SELECT id FROM officers ORDER BY id');
    assert.equal(result.rowCount, 3);
    assert.equal((await connection.query('SELECT id FROM officers WHERE id=$1', [b.officerId])).rowCount, 0);
  });
  assert.equal((await app.query('SELECT count(*)::int AS count FROM officers')).rows[0].count, 0);
  await withTenant(app, b.actors.admin.principal, async (connection) => {
    const result = await connection.query('SELECT id FROM officers');
    assert.equal(result.rowCount, 3);
    assert.ok(result.rows.some((row) => row.id === b.officerId));
    assert.ok(!result.rows.some((row) => row.id === a.officerId));
  });
});

test('更新履歴・再送結果の改ざんと履歴削除をDB権限で拒否する', async () => {
  for (const table of ['auth_audit_events', 'audit_events', 'idempotency_records', 'auth_idempotency_keys']) {
    await assert.rejects(app.query(`DELETE FROM ${table}`), {code: '42501'});
    await assert.rejects(app.query(`UPDATE ${table} SET company_id=company_id`), {code: '42501'});
  }
});

test('本人と所属が一致しないPrincipalと停止した利用者はトランザクションを開始できない', async () => {
  const principal = a.actors.dispatcher.principal;
  await assert.rejects(withTenant(app, {...principal, companyId: b.companyId}, async () => undefined), {code: 'SESSION_REQUIRED'});
  await assert.rejects(withTenant(app, {...principal, role: 'company_admin'}, async () => undefined), {code: 'SESSION_REQUIRED'});
  await admin.query("UPDATE memberships SET status='suspended',auth_version=auth_version+1 WHERE id=$1", [principal.membershipId]);
  await assert.rejects(withTenant(app, principal, async () => undefined), {code: 'SESSION_REQUIRED'});
});

test('マイグレーションは管理者をAPIロールに指定しても権限や既存スキーマを変更しない', async () => {
  const current = (await admin.query('SELECT current_user AS name')).rows[0].name as string;
  const attributes = async () => (await admin.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', [current])).rows[0];
  const before = await attributes();
  const migrations = (await admin.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count;
  await assert.rejects(migration.migrate(admin, current), /Unsafe database application role/);
  assert.deepEqual(await attributes(), before);
  assert.equal((await admin.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, migrations);
  const client = await admin.connect();
  try { await assert.rejects(migration.configureApplicationPrivileges(client, current), /Unsafe database application role/); }
  finally { client.release(); }
  assert.deepEqual(await attributes(), before);
});

test('APIロールがpublicスキーマ・業務テーブル・DBの所有者なら管理者による適用前に拒否する', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const owner = `keibi_owner_${suffix}`; const table = `preflight_${suffix}`; const database = `preflight_db_${suffix}`;
  await admin.query(`CREATE ROLE ${owner} NOLOGIN NOSUPERUSER CREATEDB CREATEROLE NOBYPASSRLS`);
  const client = await admin.connect();
  const attributes = async () => (await admin.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', [owner])).rows[0];
  const before = await attributes();
  try {
    await admin.query(`CREATE TABLE public.${table}(id integer)`); await admin.query(`ALTER TABLE public.${table} OWNER TO ${owner}`);
    await assert.rejects(migration.migrate(admin, owner), /Unsafe database application role/);
    assert.deepEqual(await attributes(), before);
    await admin.query(`DROP TABLE public.${table}`);
    const schemaOwner = (await admin.query("SELECT pg_get_userbyid(nspowner) AS name FROM pg_namespace WHERE nspname='public'")).rows[0].name as string;
    assert.match(schemaOwner, /^[a-z_][a-z0-9_]*$/);
    try {
      await admin.query(`ALTER SCHEMA public OWNER TO ${owner}`);
      await assert.rejects(migration.configureApplicationPrivileges(client, owner), /Unsafe database application role/);
      assert.deepEqual(await attributes(), before);
    } finally { await admin.query(`ALTER SCHEMA public OWNER TO ${schemaOwner}`); }
    await admin.query(`CREATE DATABASE ${database} OWNER ${owner}`);
    const originalUrl = new URL(process.env.TEST_DATABASE_URL!); originalUrl.pathname = `/${database}`;
    const ownershipPool = new (await import('pg')).default.Pool({ connectionString: originalUrl.href, max: 1 });
    try { await assert.rejects(migration.migrate(ownershipPool, owner), /Unsafe database application role/); }
    finally { await ownershipPool.end(); }
    assert.deepEqual(await attributes(), before);
    await admin.query(`DROP DATABASE ${database}`);
    await migration.assertApplicationRoleSafe(client, owner);
    await migration.assertApplicationRoleSafe(client, 'keibi_app');
  } finally {
    client.release();
    await admin.query(`DROP TABLE IF EXISTS public.${table}`);
    await admin.query(`DROP DATABASE IF EXISTS ${database}`);
    await admin.query(`DROP ROLE ${owner}`);
  }
});
