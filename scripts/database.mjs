import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import pg from 'pg';

const root = new URL('../', import.meta.url);
const migrations = new URL('apps/backend/migrations/', root);
const identifier = /^[a-z_][a-z0-9_]{0,62}$/;

export async function administratorPool(environment = process.env) {
  const secretFile = environment.POSTGRES_ADMIN_PASSWORD_FILE ?? '.secrets/postgres_admin_password';
  const password = (await readFile(isAbsolute(secretFile) ? secretFile : resolve(fileURLToPath(root), secretFile), 'utf8')).trim();
  if (password.length < 32) throw new Error('Database administrator secret is unavailable or too short.');
  return new pg.Pool({
    host: environment.POSTGRES_HOST ?? '127.0.0.1',
    port: Number(environment.POSTGRES_PORT ?? 5432),
    database: environment.POSTGRES_DB ?? 'keibi',
    user: environment.POSTGRES_USER ?? 'keibi',
    password, max: 2, connectionTimeoutMillis: 5000,
  });
}

export async function migrate(pool, appRole = 'keibi_app') {
  if (!identifier.test(appRole)) throw new Error('Invalid database application role.');
  const client = await pool.connect();
  try {
    await assertApplicationRoleSafe(client, appRole);
    await client.query("SELECT pg_advisory_lock(hashtextextended('keibi-schema-migrations', 0))");
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query('REVOKE ALL ON public.schema_migrations FROM PUBLIC');
    const names = (await readdir(migrations)).filter((name) => /^\d+_[\w-]+\.sql$/.test(name)).sort();
    if (!names.length) throw new Error('No database migrations were found.');
    for (const name of names) {
      const sql = await readFile(new URL(name, migrations), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM public.schema_migrations WHERE name = $1', [name]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration has changed: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      console.log(`Applied ${name}`);
    }
    await configureApplicationPrivileges(client, appRole);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtextextended('keibi-schema-migrations', 0))").catch(() => undefined);
    client.release();
  }
}

export async function configureApplicationPrivileges(client, appRole) {
  if (!identifier.test(appRole)) throw new Error('Invalid database application role.');
  await assertApplicationRoleSafe(client, appRole);
  const role = `"${appRole}"`;
  // The runtime never owns tables, bypasses RLS, performs migrations, or deletes history.
  await client.query(`ALTER ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
  await client.query('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC');
  await client.query(`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM ${role}`);
  const privateTables = new Set(['schema_migrations', 'auth_oauth_transactions', 'google_identities', 'app_sessions']);
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  for (const { tablename } of tables.rows) {
    if (privateTables.has(tablename)) continue;
    if (!identifier.test(tablename)) throw new Error('Unexpected table identifier.');
    const operations = /audit|history/.test(tablename) || ['idempotency_records', 'auth_idempotency_keys'].includes(tablename) ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE';
    await client.query(`GRANT ${operations} ON public."${tablename}" TO ${role}`);
  }
  for (const table of ['officer_qualifications', 'client_branch_access', 'duty_assignments', 'duty_qualification_requirements', 'officer_reservations']) {
    if (tables.rows.some(({ tablename }) => tablename === table)) await client.query(`GRANT DELETE ON public."${table}" TO ${role}`);
  }
  const functions = await client.query("SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'keibi\\_%' ESCAPE '\\'");
  for (const { signature } of functions.rows) {
    // regprocedure is supplied by PostgreSQL, never by a request or environment value.
    await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${role}`);
  }
}

/** Validate before any migration or ALTER ROLE so mistaken administrator configuration cannot demote an owner. */
export async function assertApplicationRoleSafe(client, appRole) {
  if (!identifier.test(appRole)) throw new Error('Invalid database application role.');
  const result = await client.query(`SELECT r.oid,r.rolsuper,r.rolbypassrls,r.rolname=current_user AS administrator,
    EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND pg_has_role(r.oid,d.datdba,'MEMBER')) AS database_owner,
    EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND pg_has_role(r.oid,n.nspowner,'MEMBER')) AS schema_owner,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') AND pg_has_role(r.oid,c.relowner,'MEMBER')) AS object_owner
    FROM pg_roles r WHERE r.rolname=$1`, [appRole]);
  const role = result.rows[0];
  if (!role || role.administrator || role.rolsuper || role.rolbypassrls || role.database_owner || role.schema_owner || role.object_owner) {
    throw new Error('Unsafe database application role: use a separate non-owner role without administrative or RLS-bypass privileges.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = await administratorPool();
  try {
    await migrate(pool, process.env.POSTGRES_APP_USER ?? 'keibi_app');
    console.log('Database migrations and runtime privileges are ready.');
  } catch (error) {
    console.error(`Database migration failed (${error.code ?? error.name}).`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
