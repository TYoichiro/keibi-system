import { createHash, randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import type { PoolClient } from 'pg';
import type { Principal } from '../auth/types.js';
import { z } from 'zod';

export type Row = Record<string, unknown>;
export type Entity = 'officer' | 'qualification' | 'client' | 'site' | 'duty-slot';
export class DomainError extends Error {
  constructor(public readonly code: string, public readonly status: 400 | 401 | 403 | 404 | 409 = 409, public readonly fieldIssues: { path: string; code: string }[] = []) { super(code); }
}
export function fail(code: string, status: 400 | 401 | 403 | 404 | 409 = 409): never { throw new DomainError(code, status); }
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DomainError('VALIDATION_ERROR', 400, result.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })));
  return result.data;
}
export function targetId(value: unknown): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) fail('NOT_FOUND', 404);
  return parsed.data;
}
export function role(principal: Principal, allowed: Principal['role'][]) { if (!allowed.includes(principal.role)) fail('OPERATION_FORBIDDEN', 403); }
export function branch(principal: Principal, branchId: string) { if (principal.role !== 'company_admin' && principal.branchId !== branchId) fail('NOT_FOUND', 404); }
export function expected(row: Row, version: number) { if (row.version !== version) fail('VERSION_CONFLICT'); }
export function string(row: Row, key: string): string { return row[key] as string; }
export function nullable(row: Row, key: string): string | null { return row[key] == null ? null : row[key] as string; }
export function instant(value: unknown): string { return new Date(value as string | Date).toISOString(); }
export function mapped(row: Row): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'company_id') continue;
    const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    result[camel] = value instanceof Date ? value.toISOString() : value;
  }
  return result;
}
export async function one(db: PoolClient, sql: string, values: unknown[]): Promise<Row> {
  const result = await db.query<Row>(sql, values);
  if (!result.rows[0]) fail('NOT_FOUND', 404);
  return result.rows[0];
}
const tables: Record<Entity, string> = { officer: 'officers', qualification: 'qualifications', client: 'clients', site: 'sites', 'duty-slot': 'duty_slots' };
export async function accessible(db: PoolClient, p: Principal, entity: Entity, id: string, lock = false): Promise<Row> {
  const row = await one(db, `SELECT * FROM ${tables[entity]} WHERE company_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`, [p.companyId, id]);
  if (entity === 'client' && p.role !== 'company_admin') {
    const access = await db.query('SELECT 1 FROM client_branch_access WHERE company_id=$1 AND client_id=$2 AND branch_id=$3', [p.companyId, id, p.branchId]);
    if (!access.rowCount) fail('NOT_FOUND', 404);
  } else if (['officer', 'site', 'duty-slot'].includes(entity)) branch(p, string(row, 'branch_id'));
  return row;
}
export async function assertBranch(db: PoolClient, p: Principal, branchId: string) {
  branch(p, branchId);
  const row = await one(db, 'SELECT * FROM branches WHERE company_id=$1 AND id=$2', [p.companyId, branchId]);
  if (row.status !== 'active') fail('STATE_CONFLICT');
  return row;
}
export async function audit(db: PoolClient, p: Principal, entity: Entity, entityId: string, branchId: string | null,
  action: string, reason: string, before: unknown, after: unknown, c: Context, now: Date) {
  await db.query(`INSERT INTO audit_events(id,company_id,branch_id,actor_id,entity_type,entity_id,action,reason,before_data,after_data,request_id,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  [randomUUID(), p.companyId, branchId, p.userId, entity, entityId, action, reason, JSON.stringify(before), JSON.stringify(after), c.res.headers.get('X-Request-Id') ?? randomUUID(), now]);
}
export async function companyWriteLock(db: PoolClient, companyId: string) {
  // Initial single-company workloads are small. This also orders master changes against publication.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))', [companyId]);
}
export type MutationResult = { entity: Entity; id: string; branchId: string | null; data: Row; status?: 200 | 201 };
export async function mutation(db: PoolClient, p: Principal, c: Context, body: unknown, now: Date,
  perform: () => Promise<MutationResult>): Promise<{ data: Row; status: 200 | 201 }> {
  await companyWriteLock(db, p.companyId);
  const key = parse(z.uuid({ version: 'v4' }), c.req.header('Idempotency-Key'));
  const hash = createHash('sha256').update(JSON.stringify([c.req.method, c.req.path, body])).digest('hex');
  const existing = await db.query<Row>('SELECT * FROM idempotency_records WHERE company_id=$1 AND actor_id=$2 AND key=$3', [p.companyId, p.userId, key]);
  if (existing.rows[0]) {
    const record = existing.rows[0];
    if (record.request_hash !== hash) fail('IDEMPOTENCY_CONFLICT');
    if (record.branch_id) branch(p, string(record, 'branch_id'));
    await accessible(db, p, record.entity_type as Entity, string(record, 'entity_id'));
    return { data: record.result as Row, status: record.http_status as 200 | 201 };
  }
  const result = await perform();
  await db.query(`INSERT INTO idempotency_records(company_id,actor_id,key,request_hash,entity_type,entity_id,branch_id,operation,result,http_status,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  [p.companyId, p.userId, key, hash, result.entity, result.id, result.branchId, `${c.req.method} ${c.req.path}`, JSON.stringify(result.data), result.status ?? 200, now]);
  return { data: result.data, status: result.status ?? 200 };
}
export async function updateFields(db: PoolClient, entity: Entity, companyId: string, id: string, input: Row, columns: Record<string, string>, now: Date) {
  const keys = Object.keys(columns).filter((key) => input[key] !== undefined);
  const values: unknown[] = [companyId, id];
  const setters = keys.map((key) => { values.push(input[key] === '' ? null : input[key]); return `${columns[key]}=$${values.length}`; });
  if (entity === 'site' && keys.includes('instructions') && input.instructions === '') {
    values[keys.indexOf('instructions') + 2] = '';
  }
  if (['officer', 'duty-slot'].includes(entity)) { values.push(now); setters.push(`updated_at=$${values.length}`); }
  return one(db, `UPDATE ${tables[entity]} SET ${[...setters, 'version=version+1'].join(',')} WHERE company_id=$1 AND id=$2 RETURNING *`, values);
}
export function mutationData(row: Row): Row { return { id: row.id, version: row.version }; }
export async function quota(db: PoolClient, p: Principal, branchId: string, excludeId?: string) {
  const target = await one(db, 'SELECT officer_limit FROM branches WHERE company_id=$1 AND id=$2 FOR UPDATE', [p.companyId, branchId]);
  const count = await db.query<Row>(`SELECT count(*)::int AS count FROM officers WHERE company_id=$1 AND branch_id=$2 AND status<>'retired' AND ($3::uuid IS NULL OR id<>$3)`, [p.companyId, branchId, excludeId ?? null]);
  if (Number(count.rows[0].count) >= Number(target.officer_limit)) fail('QUOTA_EXCEEDED');
}
export async function ongoingOfficer(db: PoolClient, companyId: string, id: string, now: Date) {
  const result = await db.query('SELECT 1 FROM officer_reservations WHERE company_id=$1 AND officer_id=$2 AND ends_at>$3 LIMIT 1', [companyId, id, now]);
  if (result.rowCount) fail('ONGOING_DUTIES');
}
export function sqlError(error: unknown): DomainError | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  switch (error.code) {
    case '23P01': return new DomainError('DUTY_OVERLAP');
    case '23505': return new DomainError('DUPLICATE_CODE');
    case '23503': return new DomainError('STATE_CONFLICT');
    case '23514': return new DomainError('DUTY_CONDITIONS_NOT_MET');
    case '40P01': case '40001': return new DomainError('VERSION_CONFLICT');
    default: return null;
  }
}
