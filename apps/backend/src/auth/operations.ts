import type { PoolClient } from 'pg';
import type { Principal } from './types.js';

/** Only the original actor can inspect a committed result, under their current authorization. */
export async function authOperation(db: PoolClient, principal: Principal, key: string) {
  if (principal.role !== 'company_admin') return null;
  const stored = await db.query<{
    entity_type: 'branch' | 'membership'; entity_id: string; headquarters_required: boolean; response: Record<string, unknown>;
  }>('SELECT entity_type,entity_id,headquarters_required,response FROM auth_idempotency_keys WHERE company_id=$1 AND user_id=$2 AND key=$3',
  [principal.companyId, principal.userId, key]);
  const record = stored.rows[0];
  if (!record) return null;
  if (record.headquarters_required) {
    const headquarters = await db.query("SELECT id FROM branches WHERE company_id=$1 AND id=$2 AND kind='headquarters' AND status='active'", [principal.companyId, principal.branchId]);
    if (!headquarters.rowCount) return null;
  }
  const target = record.entity_type === 'branch'
    ? await db.query('SELECT id FROM branches WHERE company_id=$1 AND id=$2', [principal.companyId, record.entity_id])
    : await db.query('SELECT id FROM memberships WHERE company_id=$1 AND id=$2', [principal.companyId, record.entity_id]);
  if (!target.rowCount) return null;
  const result = record.response;
  if (record.entity_type === 'membership' && result.membership && typeof result.membership === 'object') {
    const delivery = await db.query('SELECT delivery_status FROM auth_invitations WHERE company_id=$1 AND membership_id=$2 ORDER BY (revoked_at IS NULL AND consumed_at IS NULL) DESC,issued_at DESC,id DESC LIMIT 1', [principal.companyId, record.entity_id]);
    if (delivery.rows[0]) { result.delivery = delivery.rows[0].delivery_status; Object.assign(result.membership, { invitationDelivery: result.delivery }); }
  }
  return { status: 'succeeded', resultRef: { type: record.entity_type, id: record.entity_id }, result };
}
