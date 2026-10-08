import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Principal, Role } from '../src/auth/types.js';

export const TEST_NOW = new Date('2026-10-03T00:00:00Z');
export type TestActor = { principal: Principal; cookie: string; csrfToken: string };

/** Synthetic identities and pre-authenticated sessions are created only in the isolated test DB. */
export async function seedTestCompany(admin: pg.Pool, suffix = randomUUID().slice(0, 8), now = TEST_NOW) {
  const companyId = randomUUID();
  const headquartersId = randomUUID();
  const branchId = randomUUID();
  const officerId = randomUUID();
  const secondOfficerId = randomUUID();
  const branchOfficerId = randomUUID();
  const clientId = randomUUID();
  const siteId = randomUUID();
  const qualificationId = randomUUID();
  const client = await admin.connect();
  const actors: Record<string, TestActor> = {};
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO companies(id,code,name) VALUES($1,$2,$3)', [companyId, `TEST_${suffix.toUpperCase()}`, `試験警備 ${suffix}`]);
    await client.query("INSERT INTO branches(id,company_id,code,name,kind) VALUES($1,$2,'HQ','本店','headquarters'),($3,$2,'BR','横浜支店','branch')", [headquartersId, companyId, branchId]);
    for (const [id, branch, code, name] of [[officerId, headquartersId, 'G001', '田中 和也'], [secondOfficerId, headquartersId, 'G002', '鈴木 一郎'], [branchOfficerId, branchId, 'G003', '支店 隊員']]) {
      await client.query('INSERT INTO officers(id,company_id,branch_id,code,name,business_phone,internal_memo) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, companyId, branch, code, name, '000-0000-0000', '試験用の非公開管制メモ']);
    }
    await client.query("INSERT INTO qualifications(id,company_id,code,name) VALUES($1,$2,'TEST_QUAL','試験資格（法的資格ではありません）')", [qualificationId, companyId]);
    await client.query("INSERT INTO clients(id,company_id,code,name,contact_name,business_phone) VALUES($1,$2,'C001','架空建設株式会社','試験窓口','000-1111-1111')", [clientId, companyId]);
    await client.query('INSERT INTO client_branch_access(company_id,client_id,branch_id) VALUES($1,$2,$3),($1,$2,$4)', [companyId, clientId, headquartersId, branchId]);
    await client.query("INSERT INTO sites(id,company_id,branch_id,client_id,code,name,security_type,location,meeting_point,status,instructions,internal_memo,contact_name,business_phone) VALUES($1,$2,$3,$4,'S001','駅前工事現場','traffic','架空市 駅前1-1','東口の試験受付','active','反射ベストを着用してください','非公開の契約メモ','試験現場窓口','000-2222-2222')", [siteId, companyId, headquartersId, clientId]);
    const definitions: Array<[string, Role, string, string | null]> = [
      ['admin', 'company_admin', headquartersId, null], ['secondAdmin', 'company_admin', headquartersId, null],
      ['branchAdmin', 'company_admin', branchId, null], ['dispatcher', 'dispatcher', headquartersId, null],
      ['viewer', 'viewer', headquartersId, null], ['guard', 'guard', headquartersId, officerId],
      ['secondGuard', 'guard', headquartersId, secondOfficerId], ['branchDispatcher', 'dispatcher', branchId, null],
    ];
    for (const [name, role, assignedBranch, assignedOfficer] of definitions) {
      const userId = randomUUID();
      const membershipId = randomUUID();
      const cookie = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(cookie).digest('hex');
      const email = `keibi-test-${suffix}-${name.toLowerCase()}@gmail.com`;
      await client.query("INSERT INTO app_users(id,display_name,status) VALUES($1,$2,'active')", [userId, name === 'guard' ? '田中 和也' : `試験 ${name}`]);
      await client.query("INSERT INTO memberships(id,user_id,company_id,branch_id,role,officer_id,invitation_email,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active')", [membershipId, userId, companyId, assignedBranch, role, assignedOfficer, email]);
      await client.query("INSERT INTO google_identities(id,user_id,issuer,subject,email,linked_at) VALUES($1,$2,'https://accounts.google.com',$3,$4,$5)", [randomUUID(), userId, `synthetic-${suffix}-${name}`, email, now]);
      await client.query('INSERT INTO app_sessions(id,token_hash,user_id,membership_id,auth_version,created_at,last_activity_at,absolute_expires_at) VALUES($1,$2,$3,$4,1,$5,$5,$6)', [randomUUID(), tokenHash, userId, membershipId, now, new Date(now.getTime() + 31 * 86400000)]);
      actors[name] = { principal: { userId, membershipId, companyId, branchId: assignedBranch, role, officerId: assignedOfficer }, cookie, csrfToken: createHash('sha256').update(`keibi-csrf:${cookie}`).digest('hex') };
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  return { companyId, headquartersId, branchId, officerId, secondOfficerId, branchOfficerId, clientId, siteId, qualificationId, actors };
}

export type CompanyFixture = Awaited<ReturnType<typeof seedTestCompany>>;
