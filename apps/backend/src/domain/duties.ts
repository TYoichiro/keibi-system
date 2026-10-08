import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { Principal } from '../auth/types.js';
import type { Registration } from './router.js';
import { accessible, assertBranch, audit, expected, fail, instant, mapped, nullable, one, parse, string, targetId, type Row } from './core.js';
import { siteSnapshot } from './masters.js';
import * as v from './validation.js';

const readers: Principal['role'][] = ['company_admin', 'dispatcher', 'viewer'];
const writers: Principal['role'][] = ['company_admin', 'dispatcher'];

export async function revisionDto(db: PoolClient, companyId: string, id: string): Promise<Row> {
  const row = await one(db, 'SELECT *,duty_date::text FROM duty_revisions WHERE company_id=$1 AND id=$2', [companyId, id]);
  const assignments = await db.query<Row>('SELECT officer_id,is_leader,officer_name FROM duty_assignments WHERE company_id=$1 AND revision_id=$2 ORDER BY officer_id', [companyId, id]);
  const requirements = await db.query<Row>('SELECT qualification_id,required_qualified_count FROM duty_qualification_requirements WHERE company_id=$1 AND revision_id=$2 ORDER BY qualification_id', [companyId, id]);
  return { ...mapped(row), assignments: assignments.rows.map(mapped), qualificationRequirements: requirements.rows.map(mapped) };
}
async function slotDto(db: PoolClient, p: Principal, slot: Row) {
  const dto = mapped(slot);
  dto.draft = slot.draft_version_id ? await revisionDto(db, p.companyId, string(slot, 'draft_version_id')) : null;
  dto.published = slot.published_version_id ? await revisionDto(db, p.companyId, string(slot, 'published_version_id')) : null;
  if (dto.draft) (dto.draft as Row).warnings = await draftWarnings(db, p, slot, dto.draft as Row);
  if (p.role === 'viewer') {
    for (const revision of [dto.draft, dto.published]) if (revision) { delete (revision as Row).reason; delete (revision as Row).confirmedBy; }
  }
  return dto;
}
async function draftWarnings(db: PoolClient, p: Principal, slot: Row, draft: Row) {
  const assignments = draft.assignments as Row[];
  const warnings: Row[] = [];
  if (assignments.length < Number(draft.requiredCount)) warnings.push({ code: 'STAFF_SHORTAGE', shortageCount: Number(draft.requiredCount) - assignments.length });
  if (assignments.filter((item) => item.isLeader).length !== 1) warnings.push({ code: 'LEADER_REQUIRED' });
  if (!(draft.availabilityCheck as { confirmed: boolean }).confirmed) warnings.push({ code: 'AVAILABILITY_CHECK_REQUIRED' });
  if (!(draft.travelRestCheck as { confirmed: boolean }).confirmed) warnings.push({ code: 'TRAVEL_REST_CHECK_REQUIRED' });
  const officers = assignments.map((item) => item.officerId);
  const overlap = await db.query<Row>(`SELECT DISTINCT officer_id FROM officer_reservations WHERE company_id=$1 AND slot_id<>$2
    AND officer_id=ANY($3::uuid[]) AND tstzrange(starts_at,ends_at,'[)') && tstzrange($4::timestamptz,$5::timestamptz,'[)')`, [p.companyId, slot.id, officers, draft.startsAt, draft.endsAt]);
  for (const row of overlap.rows) warnings.push({ code: 'DUTY_OVERLAP', officerId: row.officer_id });
  const unavailable = await db.query<Row>("SELECT id FROM officers WHERE company_id=$1 AND id=ANY($2::uuid[]) AND status<>'active'", [p.companyId, officers]);
  for (const row of unavailable.rows) warnings.push({ code: 'OFFICER_NOT_ACTIVE', officerId: row.id });
  for (const requirement of draft.qualificationRequirements as Row[]) {
    const qualification = await accessible(db, p, 'qualification', String(requirement.qualificationId));
    const holders = await db.query<Row>(`SELECT valid_from::text,valid_through::text FROM officer_qualifications WHERE company_id=$1 AND qualification_id=$2
      AND officer_id=ANY($3::uuid[]) AND verification_status='verified'`, [p.companyId, requirement.qualificationId, officers]);
    const count = qualification.status === 'active' ? holders.rows.filter((row) => v.withinPeriod(String(draft.startsAt), String(draft.endsAt), nullable(row, 'valid_from'), nullable(row, 'valid_through'))).length : 0;
    if (count < Number(requirement.requiredQualifiedCount)) warnings.push({ code: 'QUALIFICATION_SHORTAGE', qualificationId: requirement.qualificationId, shortageCount: Number(requirement.requiredQualifiedCount) - count });
  }
  return warnings;
}
async function revisionRow(db: PoolClient, p: Principal, id: string) {
  return one(db, 'SELECT *,duty_date::text FROM duty_revisions WHERE company_id=$1 AND id=$2', [p.companyId, id]);
}
function editable(p: Principal, now: Date, current: Row | null, proposed?: v.DraftInput) {
  if (!current && proposed && Date.parse(proposed.startsAt) <= now.getTime()) fail('PAST_DUTY_NOT_ALLOWED');
  const records: { startsAt: number; endsAt: number }[] = [];
  if (current) records.push({ startsAt: new Date(current.starts_at as Date).getTime(), endsAt: new Date(current.ends_at as Date).getTime() });
  if (proposed) records.push({ startsAt: Date.parse(proposed.startsAt), endsAt: Date.parse(proposed.endsAt) });
  if (records.some((record) => record.endsAt <= now.getTime())) fail('DUTY_ALREADY_ENDED');
  if (p.role === 'dispatcher' && records.some((record) => record.startsAt <= now.getTime())) fail('OPERATION_FORBIDDEN', 403);
}
async function validateRelated(db: PoolClient, p: Principal, slot: Row, input: v.DraftInput) {
  for (const assignment of input.assignments) {
    const officer = await accessible(db, p, 'officer', assignment.officerId);
    if (officer.branch_id !== slot.branch_id) fail('NOT_FOUND', 404);
  }
  for (const requirement of input.qualificationRequirements) await accessible(db, p, 'qualification', requirement.qualificationId);
}
async function writeChildren(db: PoolClient, p: Principal, revisionId: string, input: v.DraftInput) {
  await db.query('DELETE FROM duty_assignments WHERE company_id=$1 AND revision_id=$2', [p.companyId, revisionId]);
  await db.query('DELETE FROM duty_qualification_requirements WHERE company_id=$1 AND revision_id=$2', [p.companyId, revisionId]);
  for (const assignment of input.assignments) {
    const officer = await accessible(db, p, 'officer', assignment.officerId);
    await db.query('INSERT INTO duty_assignments(company_id,revision_id,officer_id,is_leader,officer_name) VALUES($1,$2,$3,$4,$5)', [p.companyId, revisionId, assignment.officerId, assignment.isLeader, officer.name]);
  }
  for (const requirement of input.qualificationRequirements) await db.query(`INSERT INTO duty_qualification_requirements(company_id,revision_id,qualification_id,required_qualified_count) VALUES($1,$2,$3,$4)`, [p.companyId, revisionId, requirement.qualificationId, requirement.requiredQualifiedCount]);
}
async function insertRevision(db: PoolClient, p: Principal, slot: Row, number: number, input: v.DraftInput) {
  await validateRelated(db, p, slot, input);
  const site = await accessible(db, p, 'site', string(slot, 'site_id'));
  const snapshot = input.siteSnapshot ?? await siteSnapshot(db, p, site);
  const id = randomUUID();
  await db.query(`INSERT INTO duty_revisions(id,company_id,slot_id,number,duty_date,starts_at,ends_at,required_count,site_snapshot,availability_check,travel_rest_check,reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id, p.companyId, slot.id, number, input.dutyDate, input.startsAt, input.endsAt, input.requiredCount, JSON.stringify(snapshot), JSON.stringify(input.availabilityCheck), JSON.stringify(input.travelRestCheck), input.reason]);
  await writeChildren(db, p, id, input);
  return id;
}
function inputFromRevision(dto: Row): v.DraftInput {
  return parse(v.draftCreate, {
    dutyDate: dto.dutyDate, startsAt: dto.startsAt, endsAt: dto.endsAt, requiredCount: dto.requiredCount,
    assignments: (dto.assignments as Row[]).map((item) => ({ officerId: item.officerId, isLeader: item.isLeader })),
    qualificationRequirements: dto.qualificationRequirements, siteSnapshot: dto.siteSnapshot,
    availabilityCheck: { confirmed: false }, travelRestCheck: { confirmed: false }, reason: '',
  });
}
async function bump(db: PoolClient, p: Principal, slotId: string, now: Date, setters = '') {
  return one(db, `UPDATE duty_slots SET version=version+1,updated_at=$3${setters} WHERE company_id=$1 AND id=$2 RETURNING *`, [p.companyId, slotId, now]);
}
function result(slot: Row): Row {
  return { id: slot.id, slotId: slot.id, version: slot.version, state: slot.state, draftVersionId: slot.draft_version_id, publishedVersionId: slot.published_version_id };
}
async function conditions(db: PoolClient, p: Principal, slot: Row, draft: Row) {
  const input = inputFromRevision(await revisionDto(db, p.companyId, string(draft, 'id')));
  const assignments = input.assignments;
  if (assignments.length < Number(draft.required_count) || assignments.filter((item) => item.isLeader).length !== 1 ||
    !(draft.availability_check as { confirmed: boolean }).confirmed || !(draft.travel_rest_check as { confirmed: boolean }).confirmed) fail('DUTY_CONDITIONS_NOT_MET');
  const site = await accessible(db, p, 'site', string(slot, 'site_id'), true);
  await assertBranch(db, p, string(slot, 'branch_id'));
  if (!['planned', 'active'].includes(string(site, 'status'))) fail('DUTY_CONDITIONS_NOT_MET');
  const client = await accessible(db, p, 'client', string(site, 'client_id'), true);
  if (client.status !== 'active') fail('DUTY_CONDITIONS_NOT_MET');
  await one(db, 'SELECT 1 FROM client_branch_access WHERE company_id=$1 AND client_id=$2 AND branch_id=$3', [p.companyId, site.client_id, slot.branch_id]);
  if (!v.withinPeriod(input.startsAt, input.endsAt, nullable(site, 'contract_from'), nullable(site, 'contract_through'))) fail('DUTY_CONDITIONS_NOT_MET');
  for (const assignment of [...assignments].sort((a, b) => a.officerId.localeCompare(b.officerId))) {
    const officer = await accessible(db, p, 'officer', assignment.officerId, true);
    if (officer.branch_id !== slot.branch_id || officer.status !== 'active') fail('DUTY_CONDITIONS_NOT_MET');
    await db.query('UPDATE duty_assignments SET officer_name=$4 WHERE company_id=$1 AND revision_id=$2 AND officer_id=$3', [p.companyId, draft.id, assignment.officerId, officer.name]);
  }
  for (const requirement of input.qualificationRequirements) {
    const qualification = await accessible(db, p, 'qualification', requirement.qualificationId, true);
    if (qualification.status !== 'active') fail('DUTY_CONDITIONS_NOT_MET');
    const verified = await db.query<Row>(`SELECT valid_from::text,valid_through::text FROM officer_qualifications WHERE company_id=$1 AND qualification_id=$2
      AND officer_id=ANY($3::uuid[]) AND verification_status='verified'`, [p.companyId, requirement.qualificationId, assignments.map((item) => item.officerId)]);
    const count = verified.rows.filter((row) => v.withinPeriod(input.startsAt, input.endsAt, nullable(row, 'valid_from'), nullable(row, 'valid_through'))).length;
    if (count < requirement.requiredQualifiedCount) fail('DUTY_CONDITIONS_NOT_MET');
  }
  return input;
}

export function registerDuties(routes: Registration) {
  routes.read('/api/duty-slots', readers, async (db, p, c) => {
    const query = parse(v.dutyQuery, c.req.query());
    if (query.branchId) await assertBranch(db, p, query.branchId);
    if (query.siteId) await accessible(db, p, 'site', query.siteId);
    if (query.officerId) await accessible(db, p, 'officer', query.officerId);
    if (query.status && !['draft', 'confirmed', 'cancelled'].includes(query.status)) fail('VALIDATION_ERROR', 400);
    const where = `s.company_id=$1 AND ($2::uuid IS NULL OR s.branch_id=$2) AND ($5::uuid IS NULL OR s.site_id=$5) AND ($6::text IS NULL OR s.state=$6)
      AND EXISTS(SELECT 1 FROM duty_revisions r WHERE r.company_id=s.company_id AND r.slot_id=s.id AND (r.id=s.draft_version_id OR r.id=s.published_version_id)
        AND r.duty_date BETWEEN $3::date AND $4::date AND ($8::text IS NULL OR r.site_snapshot->>'name' ILIKE $8)
        AND ($7::uuid IS NULL OR EXISTS(SELECT 1 FROM duty_assignments a WHERE a.company_id=r.company_id AND a.revision_id=r.id AND a.officer_id=$7)))`;
    const values = [p.companyId, p.role === 'company_admin' ? query.branchId ?? null : p.branchId, query.from, query.to, query.siteId ?? null, query.status ?? null, query.officerId ?? null, query.q ? `%${query.q}%` : null];
    const total = await db.query<Row>(`SELECT count(*)::int AS count FROM duty_slots s WHERE ${where}`, values);
    const rows = await db.query<Row>(`SELECT s.* FROM duty_slots s WHERE ${where} ORDER BY s.created_at,s.id LIMIT $9 OFFSET $10`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
    const data: Row[] = [];
    for (const row of rows.rows) data.push(await slotDto(db, p, row));
    return { data, page: query.page, pageSize: query.pageSize, total: total.rows[0].count };
  });
  routes.read('/api/duty-slots/:id', readers, async (db, p, c) => {
    const row = await accessible(db, p, 'duty-slot', targetId(c.req.param('id')));
    const data = await slotDto(db, p, row);
    const history = await db.query<Row>('SELECT id,number,state,duty_date::text,starts_at,ends_at,required_count,reason,confirmed_at FROM duty_revisions WHERE company_id=$1 AND slot_id=$2 ORDER BY number', [p.companyId, row.id]);
    data.history = history.rows.map((item) => { const value = mapped(item); if (p.role === 'viewer') delete value.reason; return value; });
    return { data };
  });
  routes.write('post', '/api/duty-slots', writers, v.slotCreate, async (db, p, c, now, body) => {
    const site = await accessible(db, p, 'site', body.siteId, true);
    await assertBranch(db, p, string(site, 'branch_id'));
    if (!['planned', 'active'].includes(string(site, 'status'))) fail('STATE_CONFLICT');
    editable(p, now, null, body);
    const id = randomUUID(); const slot = await one(db, `INSERT INTO duty_slots(id,company_id,branch_id,site_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) RETURNING *`, [id, p.companyId, site.branch_id, body.siteId, now]);
    const revisionId = await insertRevision(db, p, slot, 1, body);
    const updated = await one(db, 'UPDATE duty_slots SET draft_version_id=$3 WHERE company_id=$1 AND id=$2 RETURNING *', [p.companyId, id, revisionId]);
    await audit(db, p, 'duty-slot', id, string(site, 'branch_id'), 'draft_created', body.reason, null, { ...result(updated), draft: await revisionDto(db, p.companyId, revisionId) }, c, now);
    return { entity: 'duty-slot', id, branchId: string(site, 'branch_id'), data: result(updated), status: 201 };
  });
  routes.write('put', '/api/duty-slots/:id/draft', writers, v.draftUpdate, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const slot = await accessible(db, p, 'duty-slot', id, true); expected(slot, body.expectedVersion);
    if (slot.state === 'cancelled' || slot.draft_version_id !== body.draftVersionId) fail('STATE_CONFLICT');
    const current = slot.published_version_id ? await revisionRow(db, p, string(slot, 'published_version_id')) : null;
    editable(p, now, current, body); await validateRelated(db, p, slot, body);
    const before = await revisionDto(db, p.companyId, body.draftVersionId);
    const snapshot = body.siteSnapshot ?? before.siteSnapshot;
    await db.query(`UPDATE duty_revisions SET duty_date=$3,starts_at=$4,ends_at=$5,required_count=$6,site_snapshot=$7,availability_check=$8,travel_rest_check=$9,reason=$10
      WHERE company_id=$1 AND id=$2 AND state='draft'`, [p.companyId, body.draftVersionId, body.dutyDate, body.startsAt, body.endsAt, body.requiredCount, JSON.stringify(snapshot), JSON.stringify(body.availabilityCheck), JSON.stringify(body.travelRestCheck), body.reason]);
    await writeChildren(db, p, body.draftVersionId, body);
    const updated = await bump(db, p, id, now);
    await audit(db, p, 'duty-slot', id, string(slot, 'branch_id'), 'draft_updated', body.reason, before, await revisionDto(db, p.companyId, body.draftVersionId), c, now);
    return { entity: 'duty-slot', id, branchId: string(slot, 'branch_id'), data: result(updated) };
  });
  routes.write('post', '/api/duty-slots/:id/revisions', writers, v.slotAction, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const slot = await accessible(db, p, 'duty-slot', id, true); expected(slot, body.expectedVersion);
    if (slot.state !== 'confirmed' || slot.draft_version_id || !slot.published_version_id) fail('STATE_CONFLICT');
    const current = await revisionRow(db, p, string(slot, 'published_version_id')); editable(p, now, current);
    const max = await db.query<Row>('SELECT max(number)::int AS number FROM duty_revisions WHERE company_id=$1 AND slot_id=$2', [p.companyId, id]);
    const input = inputFromRevision(await revisionDto(db, p.companyId, string(current, 'id'))); input.reason = body.reason;
    const revisionId = await insertRevision(db, p, slot, Number(max.rows[0].number) + 1, input);
    const updated = await one(db, 'UPDATE duty_slots SET draft_version_id=$3,version=version+1,updated_at=$4 WHERE company_id=$1 AND id=$2 RETURNING *', [p.companyId, id, revisionId, now]);
    await audit(db, p, 'duty-slot', id, string(slot, 'branch_id'), 'revision_created', body.reason, result(slot), result(updated), c, now);
    return { entity: 'duty-slot', id, branchId: string(slot, 'branch_id'), data: result(updated) };
  });
  routes.write('post', '/api/duty-slots/:id/discard-draft', writers, v.slotAction, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const slot = await accessible(db, p, 'duty-slot', id, true); expected(slot, body.expectedVersion);
    if (!slot.draft_version_id || slot.state === 'cancelled') fail('STATE_CONFLICT');
    if (slot.published_version_id) editable(p, now, await revisionRow(db, p, string(slot, 'published_version_id')));
    const draft = await revisionDto(db, p.companyId, string(slot, 'draft_version_id'));
    await db.query("UPDATE duty_revisions SET state='discarded' WHERE company_id=$1 AND id=$2", [p.companyId, slot.draft_version_id]);
    const updated = await bump(db, p, id, now, `,draft_version_id=NULL${slot.published_version_id ? '' : ",state='cancelled'"}`);
    await audit(db, p, 'duty-slot', id, string(slot, 'branch_id'), 'draft_discarded', body.reason, draft, result(updated), c, now);
    return { entity: 'duty-slot', id, branchId: string(slot, 'branch_id'), data: result(updated) };
  });
  routes.write('post', '/api/duty-slots/:id/confirm', writers, v.slotConfirm, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const slot = await accessible(db, p, 'duty-slot', id, true); expected(slot, body.expectedVersion);
    if (slot.state === 'cancelled' || slot.draft_version_id !== body.draftVersionId) fail('STATE_CONFLICT');
    const draft = await revisionRow(db, p, body.draftVersionId);
    const current = slot.published_version_id ? await revisionRow(db, p, string(slot, 'published_version_id')) : null;
    const proposed = inputFromRevision(await revisionDto(db, p.companyId, body.draftVersionId));
    editable(p, now, current, proposed);
    const input = await conditions(db, p, slot, draft);
    const before = current ? await revisionDto(db, p.companyId, string(current, 'id')) : null;
    await db.query('DELETE FROM officer_reservations WHERE company_id=$1 AND slot_id=$2', [p.companyId, id]);
    if (current) await db.query("UPDATE duty_revisions SET state='superseded' WHERE company_id=$1 AND id=$2", [p.companyId, current.id]);
    await db.query("UPDATE duty_revisions SET state='published',reason=$3,confirmed_at=$4,confirmed_by=$5 WHERE company_id=$1 AND id=$2 AND state='draft'", [p.companyId, draft.id, body.reason, now, p.userId]);
    const updated = await one(db, "UPDATE duty_slots SET state='confirmed',published_version_id=$3,draft_version_id=NULL,version=version+1,updated_at=$4 WHERE company_id=$1 AND id=$2 RETURNING *", [p.companyId, id, draft.id, now]);
    for (const assignment of input.assignments) await db.query(`INSERT INTO officer_reservations(company_id,slot_id,revision_id,officer_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6)`, [p.companyId, id, draft.id, assignment.officerId, input.startsAt, input.endsAt]);
    await audit(db, p, 'duty-slot', id, string(slot, 'branch_id'), current ? 'revision_confirmed' : 'confirmed', body.reason, before, await revisionDto(db, p.companyId, string(draft, 'id')), c, now);
    return { entity: 'duty-slot', id, branchId: string(slot, 'branch_id'), data: { ...result(updated), confirmedAt: now.toISOString() } };
  });
  routes.write('post', '/api/duty-slots/:id/cancel', writers, v.slotAction, async (db, p, c, now, body) => {
    const id = targetId(c.req.param('id')); const slot = await accessible(db, p, 'duty-slot', id, true); expected(slot, body.expectedVersion);
    if (slot.state === 'cancelled') fail('STATE_CONFLICT');
    if (slot.published_version_id) editable(p, now, await revisionRow(db, p, string(slot, 'published_version_id')));
    const before = await slotDto(db, p, slot);
    await db.query('DELETE FROM officer_reservations WHERE company_id=$1 AND slot_id=$2', [p.companyId, id]);
    if (slot.published_version_id) await db.query("UPDATE duty_revisions SET state='cancelled' WHERE company_id=$1 AND id=$2", [p.companyId, slot.published_version_id]);
    if (slot.draft_version_id) await db.query("UPDATE duty_revisions SET state='discarded' WHERE company_id=$1 AND id=$2", [p.companyId, slot.draft_version_id]);
    const updated = await bump(db, p, id, now, ",state='cancelled',draft_version_id=NULL");
    await audit(db, p, 'duty-slot', id, string(slot, 'branch_id'), 'cancelled', body.reason, before, result(updated), c, now);
    return { entity: 'duty-slot', id, branchId: string(slot, 'branch_id'), data: result(updated) };
  });
  routes.read('/api/assignment-summary', readers, async (db, p, c) => {
    const query = parse(z.strictObject({ date: v.date, branchId: v.uuid.optional() }), c.req.query());
    if (query.branchId) await assertBranch(db, p, query.branchId);
    const scope = p.role === 'company_admin' ? query.branchId ?? null : p.branchId;
    const officers = await db.query<Row>("SELECT count(*)::int AS count FROM officers WHERE company_id=$1 AND ($2::uuid IS NULL OR branch_id=$2) AND status='active'", [p.companyId, scope]);
    const sites = await db.query<Row>("SELECT count(*)::int AS count FROM sites WHERE company_id=$1 AND ($2::uuid IS NULL OR branch_id=$2) AND status IN ('planned','active')", [p.companyId, scope]);
    const slots = await db.query<Row>(`SELECT r.required_count,r.state,(SELECT count(*)::int FROM duty_assignments a WHERE a.company_id=r.company_id AND a.revision_id=r.id) AS assigned_count
      FROM duty_slots s JOIN duty_revisions r ON r.company_id=s.company_id AND (r.id=s.published_version_id OR r.id=s.draft_version_id)
      WHERE s.company_id=$1 AND ($2::uuid IS NULL OR s.branch_id=$2) AND s.state<>'cancelled' AND r.duty_date=$3`, [p.companyId, scope, query.date]);
    const published = slots.rows.filter((item) => item.state === 'published'); const drafts = slots.rows.filter((item) => item.state === 'draft');
    const sum = (rows: Row[], key: string) => rows.reduce((value, row) => value + Number(row[key]), 0);
    const shortage = (rows: Row[]) => rows.reduce((value, row) => value + Math.max(0, Number(row.required_count) - Number(row.assigned_count)), 0);
    return { data: { officerCount: officers.rows[0].count, siteCount: sites.rows[0].count, publishedSlotCount: published.length,
      publishedAssignedCount: sum(published, 'assigned_count'), publishedRequiredCount: sum(published, 'required_count'), publishedShortageCount: shortage(published), draftSlotCount: drafts.length, draftShortageCount: shortage(drafts) } };
  });
  routes.read('/api/me/duties', ['guard'], async (db, p, c) => {
    const query = parse(v.guardQuery, c.req.query());
    const rows = await ownPublished(db, p, null, query.from, query.to);
    return { data: rows.map(guardDuty) };
  });
  routes.read('/api/me/duties/:slotId', ['guard'], async (db, p, c) => {
    const id = targetId(c.req.param('slotId')); const rows = await ownPublished(db, p, id);
    if (!rows[0]) fail('NOT_FOUND', 404); return { data: guardDuty(rows[0]) };
  });
  routes.read('/api/me/duties/:slotId/site', ['guard'], async (db, p, c, now) => {
    const id = targetId(c.req.param('slotId')); const rows = await ownPublished(db, p, id);
    const row = rows[0];
    if (!row || row.slot_state !== 'confirmed' || row.id !== row.published_version_id || new Date(row.ends_at as Date).getTime() <= now.getTime()) fail('NOT_FOUND', 404);
    return { data: row.site_snapshot };
  });
}

async function ownPublished(db: PoolClient, p: Principal, slotId: string | null, from?: string, to?: string): Promise<Row[]> {
  if (!p.officerId) fail('NOT_FOUND', 404);
  // Select the newest version actually published to this officer, excluding every draft candidate.
  const result = await db.query<Row>(`SELECT s.id AS slot_id,s.state AS slot_state,s.published_version_id,r.* FROM duty_slots s
    JOIN LATERAL(SELECT r.* FROM duty_revisions r JOIN duty_assignments a ON a.company_id=r.company_id AND a.revision_id=r.id
      WHERE r.company_id=s.company_id AND r.slot_id=s.id AND a.officer_id=$3 AND r.confirmed_at IS NOT NULL ORDER BY r.number DESC LIMIT 1) r ON true
    WHERE s.company_id=$1 AND s.branch_id=$2 AND ($4::uuid IS NULL OR s.id=$4)
      AND ($5::date IS NULL OR r.duty_date BETWEEN $5::date AND $6::date) ORDER BY r.starts_at,s.id`, [p.companyId, p.branchId, p.officerId, slotId, from ?? null, to ?? null]);
  for (const row of result.rows) row.duty_date = row.duty_date instanceof Date ? v.jstDate(row.duty_date) : row.duty_date;
  return result.rows;
}
function guardDuty(row: Row) {
  return { slotId: row.slot_id, publishedVersionId: row.id, dutyDate: row.duty_date, startsAt: instant(row.starts_at), endsAt: instant(row.ends_at),
    siteName: (row.site_snapshot as v.Snapshot).name, state: row.slot_state === 'cancelled' ? 'cancelled' : row.id === row.published_version_id ? 'confirmed' : 'removed' };
}
