import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { Principal } from '../auth/types.js';
import { authOperation } from '../auth/operations.js';
import type { Registration } from './router.js';
import { accessible, assertBranch, audit, branch, expected, fail, instant, mapped, mutationData, nullable, one, ongoingOfficer, parse, quota, string, targetId, updateFields, type Entity, type Row } from './core.js';
import * as v from './validation.js';

const readers: Principal['role'][] = ['company_admin', 'dispatcher', 'viewer'];
const writers: Principal['role'][] = ['company_admin', 'dispatcher'];
const admin: Principal['role'][] = ['company_admin'];
const officerColumns = { code: 'code', name: 'name', branchId: 'branch_id', status: 'status', businessPhone: 'business_phone', businessEmail: 'business_email', employmentType: 'employment_type', serviceArea: 'service_area', internalMemo: 'internal_memo' };
const clientColumns = { code: 'code', name: 'name', status: 'status', contactName: 'contact_name', businessPhone: 'business_phone', businessEmail: 'business_email' };
const siteColumns = { code: 'code', name: 'name', branchId: 'branch_id', clientId: 'client_id', securityType: 'security_type', location: 'location', meetingPoint: 'meeting_point', status: 'status', instructions: 'instructions', internalMemo: 'internal_memo', contactName: 'contact_name', businessPhone: 'business_phone', contractFrom: 'contract_from', contractThrough: 'contract_through' };

async function officerDto(db: PoolClient, p: Principal, row: Row) {
  const dto = mapped(row);
  const qualifications = await db.query<Row>(`SELECT oq.qualification_id,oq.verification_status,oq.valid_from::text,oq.valid_through::text,q.code,q.name,
    oq.verified_by,oq.verified_at FROM officer_qualifications oq JOIN qualifications q ON q.company_id=oq.company_id AND q.id=oq.qualification_id
    WHERE oq.company_id=$1 AND oq.officer_id=$2 ORDER BY q.code,q.id`, [p.companyId, row.id]);
  dto.qualifications = qualifications.rows.map((qualification) => {
    const value = mapped(qualification);
    if (['viewer', 'guard'].includes(p.role)) { delete value.verifiedBy; delete value.verifiedAt; }
    return value;
  });
  if (p.role === 'viewer') for (const field of ['businessPhone', 'businessEmail', 'employmentType', 'serviceArea', 'internalMemo', 'createdAt', 'updatedAt']) delete dto[field];
  if (p.role === 'guard') delete dto.internalMemo;
  return dto;
}
function siteDto(p: Principal, row: Row) { const value = mapped(row); if (p.role === 'viewer') delete value.internalMemo; return value; }
async function clientDto(db: PoolClient, p: Principal, row: Row) {
  const value = mapped(row);
  if (p.role === 'company_admin') value.branchIds = (await db.query<Row>('SELECT branch_id FROM client_branch_access WHERE company_id=$1 AND client_id=$2 ORDER BY branch_id', [p.companyId, row.id])).rows.map((item) => item.branch_id);
  return value;
}
async function list(db: PoolClient, p: Principal, entity: Entity, query: ReturnType<typeof v.listQuery.parse>) {
  const table = { officer: 'officers', qualification: 'qualifications', client: 'clients', site: 'sites', 'duty-slot': 'duty_slots' }[entity];
  const values: unknown[] = [p.companyId];
  const conditions = ['company_id=$1'];
  if (query.branchId) await assertBranch(db, p, query.branchId);
  if (entity === 'client' && (p.role !== 'company_admin' || query.branchId)) { values.push(query.branchId ?? p.branchId); conditions.push(`EXISTS(SELECT 1 FROM client_branch_access a WHERE a.company_id=${table}.company_id AND a.client_id=${table}.id AND a.branch_id=$${values.length})`); }
  if (['officer', 'site'].includes(entity) && (p.role !== 'company_admin' || query.branchId)) { values.push(query.branchId ?? p.branchId); conditions.push(`branch_id=$${values.length}`); }
  if (query.q) { values.push(`%${query.q}%`); conditions.push(`(name ILIKE $${values.length} OR code ILIKE $${values.length})`); }
  if (query.status) {
    const statuses = entity === 'officer' ? ['active', 'leave', 'retired'] : entity === 'site' ? ['planned', 'active', 'paused', 'closed'] : ['active', 'inactive'];
    if (!statuses.includes(query.status)) fail('VALIDATION_ERROR', 400);
    values.push(query.status); conditions.push(`status=$${values.length}`);
  }
  const where = conditions.join(' AND ');
  const total = await db.query<Row>(`SELECT count(*)::int AS count FROM ${table} WHERE ${where}`, values);
  const rows = await db.query<Row>(`SELECT * FROM ${table} WHERE ${where} ORDER BY code,id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
  const data: Row[] = [];
  for (const row of rows.rows) data.push(entity === 'officer' ? await officerDto(db, p, row) : entity === 'client' ? await clientDto(db, p, row) : entity === 'site' ? siteDto(p, row) : mapped(row));
  return { data, page: query.page, pageSize: query.pageSize, total: total.rows[0].count };
}
async function siteOngoing(db: PoolClient, companyId: string, siteId: string, now: Date) {
  const result = await db.query(`SELECT 1 FROM duty_slots s JOIN duty_revisions r ON r.company_id=s.company_id AND r.id=s.published_version_id
    WHERE s.company_id=$1 AND s.site_id=$2 AND s.state='confirmed' AND r.ends_at>$3 LIMIT 1`, [companyId, siteId, now]);
  if (result.rowCount) fail('ONGOING_DUTIES');
}
async function clientAllowed(db: PoolClient, p: Principal, clientId: string, branchId: string) {
  await one(db, `SELECT c.id FROM clients c JOIN client_branch_access a ON a.company_id=c.company_id AND a.client_id=c.id
    WHERE c.company_id=$1 AND c.id=$2 AND a.branch_id=$3 AND c.status='active'`, [p.companyId, clientId, branchId]);
}
async function protectPublishedQualifications(db: PoolClient, p: Principal, officerId: string, now: Date) {
  const requirements = await db.query<Row>(`SELECT d.revision_id,d.qualification_id,d.required_qualified_count,r.starts_at,r.ends_at
    FROM duty_qualification_requirements d JOIN officer_reservations r ON r.company_id=d.company_id AND r.revision_id=d.revision_id
    WHERE r.company_id=$1 AND r.officer_id=$2 AND r.ends_at>$3`, [p.companyId, officerId, now]);
  for (const requirement of requirements.rows) {
    const holders = await db.query<Row>(`SELECT oq.valid_from::text,oq.valid_through::text FROM officer_qualifications oq
      JOIN duty_assignments a ON a.company_id=oq.company_id AND a.officer_id=oq.officer_id
      JOIN qualifications q ON q.company_id=oq.company_id AND q.id=oq.qualification_id
      WHERE a.company_id=$1 AND a.revision_id=$2 AND oq.qualification_id=$3 AND oq.verification_status='verified' AND q.status='active'`, [p.companyId, requirement.revision_id, requirement.qualification_id]);
    const count = holders.rows.filter((holder) => v.withinPeriod(instant(requirement.starts_at), instant(requirement.ends_at), nullable(holder, 'valid_from'), nullable(holder, 'valid_through'))).length;
    if (count < Number(requirement.required_qualified_count)) fail('ONGOING_DUTIES');
  }
}
function contract(input: Row) {
  const from = input.contractFrom; const through = input.contractThrough;
  if (Boolean(from) !== Boolean(through) || (from && through && String(from) > String(through))) fail('VALIDATION_ERROR', 400);
}
export function registerMasters(routes: Registration) {
  for (const [entity, path] of [['officer', '/api/officers'], ['client', '/api/clients'], ['site', '/api/sites'], ['qualification', '/api/qualifications']] as const) {
    routes.read(path, readers, async (db, p, c) => list(db, p, entity, parse(v.listQuery, c.req.query())));
    routes.read(`${path}/:id`, readers, async (db, p, c) => {
      const row = await accessible(db, p, entity, targetId(c.req.param('id')));
      return { data: entity === 'officer' ? await officerDto(db, p, row) : entity === 'client' ? await clientDto(db, p, row) : entity === 'site' ? siteDto(p, row) : mapped(row) };
    });
  }
  routes.write('post', '/api/officers', writers, v.officerCreate, async (db, p, c, now, body) => {
    await assertBranch(db, p, body.branchId);
    if (body.status !== 'retired') await quota(db, p, body.branchId);
    const id = randomUUID();
    const row = await one(db, `INSERT INTO officers(id,company_id,branch_id,code,name,status,business_phone,business_email,employment_type,service_area,internal_memo,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`, [id, p.companyId, body.branchId, body.code, body.name, body.status, body.businessPhone ?? null, body.businessEmail ?? null, body.employmentType ?? null, body.serviceArea ?? null, body.internalMemo ?? null, now]);
    await audit(db, p, 'officer', id, body.branchId, 'created', '', null, mapped(row), c, now);
    return { entity: 'officer', id, branchId: body.branchId, data: mutationData(row), status: 201 };
  });
  routes.write('patch', '/api/officers/:id', writers, v.officerUpdate, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const row = await accessible(db, p, 'officer', id, true); expected(row, body.expectedVersion);
    const destination = body.branchId ?? string(row, 'branch_id'); await assertBranch(db, p, destination);
    if ((body.status && body.status !== row.status && body.status !== 'active') || destination !== row.branch_id) await ongoingOfficer(db, p.companyId, id, now);
    if (destination !== row.branch_id) {
      const membership = await db.query('SELECT 1 FROM memberships WHERE company_id=$1 AND officer_id=$2', [p.companyId, id]);
      if (membership.rowCount) fail('MAPPED_OFFICER_TRANSFER');
      const draft = await db.query(`SELECT 1 FROM duty_assignments a JOIN duty_revisions r ON r.company_id=a.company_id AND r.id=a.revision_id WHERE a.company_id=$1 AND a.officer_id=$2 AND r.state='draft'`, [p.companyId, id]);
      if (draft.rowCount) fail('STATE_CONFLICT');
    }
    const nextStatus = body.status ?? string(row, 'status');
    if (nextStatus !== 'retired' && (row.status === 'retired' || destination !== row.branch_id)) await quota(db, p, destination, id);
    const updated = await updateFields(db, 'officer', p.companyId, id, body, officerColumns, now);
    if (nextStatus === 'retired') {
      const affected = await db.query<Row>(`UPDATE memberships SET status='suspended',auth_version=auth_version+1,version=version+1
        WHERE company_id=$1 AND officer_id=$2 AND status<>'suspended' RETURNING id,user_id`, [p.companyId, id]);
      for (const membership of affected.rows) {
        await db.query('SELECT keibi_revoke_user_sessions($1,$2)', [membership.user_id, now]);
        await db.query(`INSERT INTO auth_audit_events(id,company_id,actor_id,target_id,action,reason,evidence,created_at,result)
          VALUES($1,$2,$3,$4,'officer_retired_suspension',$5,$6,$7,'success')`, [randomUUID(), p.companyId, p.userId, membership.id, body.reason, `officer:${id}`, now]);
      }
    }
    await audit(db, p, 'officer', id, destination, 'updated', body.reason, mapped(row), mapped(updated), c, now);
    return { entity: 'officer', id, branchId: destination, data: mutationData(updated) };
  });
  routes.write('post', '/api/qualifications', admin, v.qualificationCreate, async (db, p, c, now, body) => {
    const id = randomUUID(); const row = await one(db, 'INSERT INTO qualifications(id,company_id,code,name,status) VALUES($1,$2,$3,$4,$5) RETURNING *', [id, p.companyId, body.code, body.name, body.status]);
    await audit(db, p, 'qualification', id, null, 'created', '', null, mapped(row), c, now);
    return { entity: 'qualification', id, branchId: null, data: mutationData(row), status: 201 };
  });
  routes.write('patch', '/api/qualifications/:id', admin, v.qualificationUpdate, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const row = await accessible(db, p, 'qualification', id, true); expected(row, body.expectedVersion);
    if (body.status === 'inactive') {
      const used = await db.query(`SELECT 1 FROM duty_qualification_requirements q JOIN officer_reservations r ON r.company_id=q.company_id AND r.revision_id=q.revision_id
        WHERE q.company_id=$1 AND q.qualification_id=$2 AND r.ends_at>$3 LIMIT 1`, [p.companyId, id, now]);
      if (used.rowCount) fail('ONGOING_DUTIES');
    }
    const updated = await updateFields(db, 'qualification', p.companyId, id, body, { code: 'code', name: 'name', status: 'status' }, now);
    await audit(db, p, 'qualification', id, null, 'updated', body.reason, mapped(row), mapped(updated), c, now);
    return { entity: 'qualification', id, branchId: null, data: mutationData(updated) };
  });
  routes.write('put', '/api/officers/:id/qualifications', writers, v.officerQualificationUpdate, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const row = await accessible(db, p, 'officer', id, true); expected(row, body.expectedVersion);
    const before = await db.query<Row>('SELECT qualification_id,verification_status,valid_from::text,valid_through::text FROM officer_qualifications WHERE company_id=$1 AND officer_id=$2 ORDER BY qualification_id', [p.companyId, id]);
    for (const value of body.qualifications) await accessible(db, p, 'qualification', value.qualificationId);
    await db.query('DELETE FROM officer_qualifications WHERE company_id=$1 AND officer_id=$2', [p.companyId, id]);
    for (const value of body.qualifications) await db.query(`INSERT INTO officer_qualifications(company_id,officer_id,qualification_id,verification_status,valid_from,valid_through,verified_by,verified_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [p.companyId, id, value.qualificationId, value.verificationStatus, value.validFrom ?? null, value.validThrough ?? null, value.verificationStatus === 'verified' ? p.userId : null, value.verificationStatus === 'verified' ? now : null]);
    // Check the resulting aggregate conditions before committing; safe additions and renewals are allowed.
    await protectPublishedQualifications(db, p, id, now);
    const updated = await updateFields(db, 'officer', p.companyId, id, {}, {}, now);
    await audit(db, p, 'officer', id, string(row, 'branch_id'), 'qualifications_replaced', body.reason, before.rows.map(mapped), body.qualifications, c, now);
    return { entity: 'officer', id, branchId: string(row, 'branch_id'), data: mutationData(updated) };
  });
  routes.write('post', '/api/clients', admin, v.clientCreate, async (db, p, c, now, body) => {
    const id = randomUUID(); const row = await one(db, `INSERT INTO clients(id,company_id,code,name,status,contact_name,business_phone,business_email) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [id, p.companyId, body.code, body.name, body.status, body.contactName ?? null, body.businessPhone ?? null, body.businessEmail ?? null]);
    await audit(db, p, 'client', id, null, 'created', '', null, mapped(row), c, now);
    return { entity: 'client', id, branchId: null, data: mutationData(row), status: 201 };
  });
  routes.write('patch', '/api/clients/:id', admin, v.clientUpdate, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const row = await accessible(db, p, 'client', id, true); expected(row, body.expectedVersion);
    if (body.status === 'inactive') {
      const used = await db.query(`SELECT 1 FROM sites t JOIN duty_slots s ON s.company_id=t.company_id AND s.site_id=t.id JOIN duty_revisions r ON r.company_id=s.company_id AND r.id=s.published_version_id
        WHERE t.company_id=$1 AND t.client_id=$2 AND s.state='confirmed' AND r.ends_at>$3 LIMIT 1`, [p.companyId, id, now]);
      if (used.rowCount) fail('ONGOING_DUTIES');
    }
    const updated = await updateFields(db, 'client', p.companyId, id, body, clientColumns, now);
    await audit(db, p, 'client', id, null, 'updated', body.reason, mapped(row), mapped(updated), c, now);
    return { entity: 'client', id, branchId: null, data: mutationData(updated) };
  });
  routes.write('put', '/api/clients/:id/branch-access', admin, v.branchAccess, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const row = await accessible(db, p, 'client', id, true); expected(row, body.expectedVersion);
    for (const branchId of body.branchIds) await assertBranch(db, p, branchId);
    const previous = await db.query<Row>('SELECT branch_id FROM client_branch_access WHERE company_id=$1 AND client_id=$2 ORDER BY branch_id', [p.companyId, id]);
    const existingSites = await db.query<Row>('SELECT DISTINCT branch_id FROM sites WHERE company_id=$1 AND client_id=$2', [p.companyId, id]);
    if (existingSites.rows.some((site) => !body.branchIds.includes(string(site, 'branch_id')))) fail('CLIENT_ACCESS_IN_USE');
    await db.query('DELETE FROM client_branch_access WHERE company_id=$1 AND client_id=$2 AND NOT(branch_id=ANY($3::uuid[]))', [p.companyId, id, body.branchIds]);
    for (const branchId of body.branchIds) await db.query('INSERT INTO client_branch_access(company_id,client_id,branch_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [p.companyId, id, branchId]);
    const updated = await updateFields(db, 'client', p.companyId, id, {}, {}, now);
    await audit(db, p, 'client', id, null, 'branch_access_replaced', body.reason, previous.rows.map((item) => item.branch_id), body.branchIds, c, now);
    return { entity: 'client', id, branchId: null, data: mutationData(updated) };
  });
  routes.write('post', '/api/sites', writers, v.siteCreate, async (db, p, c, now, body) => {
    await assertBranch(db, p, body.branchId); await clientAllowed(db, p, body.clientId, body.branchId); contract(body);
    const id = randomUUID(); const row = await one(db, `INSERT INTO sites(id,company_id,branch_id,client_id,code,name,security_type,location,meeting_point,status,instructions,internal_memo,contact_name,business_phone,contract_from,contract_through)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`, [id, p.companyId, body.branchId, body.clientId, body.code, body.name, body.securityType, body.location, body.meetingPoint, body.status, body.instructions ?? '', body.internalMemo ?? null, body.contactName ?? null, body.businessPhone ?? null, body.contractFrom ?? null, body.contractThrough ?? null]);
    await audit(db, p, 'site', id, body.branchId, 'created', '', null, mapped(row), c, now);
    return { entity: 'site', id, branchId: body.branchId, data: mutationData(row), status: 201 };
  });
  routes.write('patch', '/api/sites/:id', writers, v.siteUpdate, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const row = await accessible(db, p, 'site', id, true); expected(row, body.expectedVersion);
    const merged = { ...mapped(row), ...body }; contract(merged);
    const destination = body.branchId ?? string(row, 'branch_id'); await assertBranch(db, p, destination);
    if (destination !== row.branch_id) {
      const slots = await db.query('SELECT 1 FROM duty_slots WHERE company_id=$1 AND site_id=$2 LIMIT 1', [p.companyId, id]);
      if (slots.rowCount) fail('SITE_TRANSFER_HAS_HISTORY');
    }
    await clientAllowed(db, p, body.clientId ?? string(row, 'client_id'), destination);
    if (body.status === 'paused' || body.status === 'closed' || body.clientId && body.clientId !== row.client_id) await siteOngoing(db, p.companyId, id, now);
    if (body.contractFrom !== undefined || body.contractThrough !== undefined) {
      const upcoming = await db.query<Row>(`SELECT r.starts_at,r.ends_at FROM duty_slots s JOIN duty_revisions r ON r.company_id=s.company_id AND r.id=s.published_version_id WHERE s.company_id=$1 AND s.site_id=$2 AND s.state='confirmed' AND r.ends_at>$3`, [p.companyId, id, now]);
      if (upcoming.rows.some((r) => !v.withinPeriod(instant(r.starts_at), instant(r.ends_at), merged.contractFrom as string | null, merged.contractThrough as string | null))) fail('ONGOING_DUTIES');
    }
    const updated = await updateFields(db, 'site', p.companyId, id, body, siteColumns, now);
    await audit(db, p, 'site', id, destination, 'updated', body.reason, mapped(row), mapped(updated), c, now);
    return { entity: 'site', id, branchId: destination, data: mutationData(updated) };
  });
  routes.read('/api/me/officer', ['guard'], async (db, p) => {
    if (!p.officerId) fail('NOT_FOUND', 404);
    return { data: await officerDto(db, p, await accessible(db, p, 'officer', p.officerId)) };
  });
  routes.read('/api/audit-events', writers, async (db, p, c) => {
    const query = parse(z.strictObject({ page: v.listQuery.shape.page, pageSize: v.listQuery.shape.pageSize, branchId: v.uuid.optional(), entityId: v.uuid.optional() }), c.req.query());
    if (query.branchId) await assertBranch(db, p, query.branchId);
    const scope = p.role === 'company_admin' ? query.branchId ?? null : p.branchId;
    const values = [p.companyId, scope, query.entityId ?? null];
    const condition = 'a.company_id=$1 AND ($2::uuid IS NULL OR a.branch_id=$2) AND ($3::uuid IS NULL OR a.entity_id=$3)';
    const total = await db.query<Row>(`SELECT count(*)::int AS count FROM audit_events a WHERE ${condition}`, values);
    const rows = await db.query<Row>(`SELECT a.*,u.display_name AS actor_name FROM audit_events a LEFT JOIN app_users u ON u.id=a.actor_id
      WHERE ${condition} ORDER BY a.created_at DESC,a.id LIMIT $4 OFFSET $5`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
    return { data: rows.rows.map(mapped), page: query.page, pageSize: query.pageSize, total: total.rows[0].count };
  });
  routes.read('/api/operations/:key', readers, async (db, p, c) => {
    const key = targetId(c.req.param('key'));
    const domain = await db.query<Row>('SELECT * FROM idempotency_records WHERE company_id=$1 AND actor_id=$2 AND key=$3', [p.companyId, p.userId, key]);
    const record = domain.rows[0];
    if (!record) {
      const recovered = await authOperation(db, p, key);
      if (!recovered) fail('NOT_FOUND', 404);
      return { data: recovered };
    }
    if (record.branch_id) branch(p, string(record, 'branch_id'));
    if (p.role === 'viewer') fail('NOT_FOUND', 404);
    await accessible(db, p, record.entity_type as Entity, string(record, 'entity_id'));
    if (['client', 'qualification'].includes(string(record, 'entity_type')) && p.role !== 'company_admin') fail('NOT_FOUND', 404);
    return { data: { status: 'succeeded', resultRef: { type: record.entity_type, id: record.entity_id }, result: record.result } };
  });
}

export async function siteSnapshot(db: PoolClient, p: Principal, site: Row): Promise<v.Snapshot> {
  const client = await one(db, 'SELECT contact_name,business_phone FROM clients WHERE company_id=$1 AND id=$2', [p.companyId, site.client_id]);
  return { name: string(site, 'name'), location: string(site, 'location'), meetingPoint: string(site, 'meeting_point'), instructions: string(site, 'instructions'), contactName: nullable(site, 'contact_name') ?? nullable(client, 'contact_name'), businessPhone: nullable(site, 'business_phone') ?? nullable(client, 'business_phone') };
}
