import type { Pool, PoolClient } from 'pg';
import { AuthError, type Principal } from './types.js';
import { recheckSession } from './service.js';

/** Tenant settings are transaction-local and cannot leak through pooled connections. */
export async function withTenant<T>(pool: Pool, principal: Principal, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Use a single lock order for authorization, quota changes, and duty confirmation.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))', [principal.companyId]);
    await client.query(`SELECT set_config('app.company_id',$1,true),set_config('app.branch_id',$2,true),
      set_config('app.role',$3,true),set_config('app.user_id',$4,true),set_config('app.officer_id',$5,true)`,
    [principal.companyId, principal.branchId, principal.role, principal.userId, principal.officerId ?? '']);
    const current = await client.query(`SELECT m.id FROM memberships m JOIN companies c ON c.id=m.company_id
      JOIN branches b ON b.id=m.branch_id AND b.company_id=m.company_id JOIN app_users u ON u.id=m.user_id
      WHERE m.id=$1 AND m.user_id=$2 AND m.company_id=$3 AND m.branch_id=$4 AND m.role=$5
      AND m.officer_id IS NOT DISTINCT FROM $6::uuid AND m.status='active' AND u.status='active'
      AND b.status='active' AND c.status='active' FOR SHARE OF m`,
    [principal.membershipId, principal.userId, principal.companyId, principal.branchId, principal.role, principal.officerId]);
    if (!current.rowCount) throw new AuthError('SESSION_REQUIRED', 401);
    await recheckSession(client, principal);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
