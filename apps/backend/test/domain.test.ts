import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { createDomainRouter } from '../src/domain/router.js';
import type { Row } from '../src/domain/core.js';
import { withTenant } from '../src/auth/tenant.js';
import { adminPool, applicationPool } from './database.js';
import { seedTestCompany, TEST_NOW, type CompanyFixture } from './fixtures.js';

const admin = adminPool(); const application = applicationPool();
after(async () => { await application.end(); await admin.end(); });
async function setup() {
  const fixture = await seedTestCompany(admin);
  let time = new Date(TEST_NOW);
  const app = createDomainRouter({ pool: application, authenticate: async (c) => fixture.actors[c.req.header('X-Test-Actor') ?? 'admin'].principal, now: () => time });
  const request = async (method: string, path: string, body?: unknown, actor = 'admin', key: string = randomUUID()) => {
    const response = await app.request(path, { method, headers: { 'X-Test-Actor': actor, 'Content-Type': 'application/json', 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json() as { data: Row | Row[]; error?: string; total?: number }) };
  };
  const createDuty = async (options: Partial<ReturnType<typeof draft>> = {}, actor = 'admin') => {
    const response = await request('POST', '/api/duty-slots', { siteId: fixture.siteId, ...draft(fixture), ...options }, actor);
    assert.equal(response.status, 201, JSON.stringify(response)); return response.data as Row;
  };
  const confirm = async (slot: Row, actor = 'admin', key?: string) => request('POST', `/api/duty-slots/${slot.id}/confirm`, { expectedVersion: slot.version, draftVersionId: slot.draftVersionId, reason: '試験確定' }, actor, key);
  return { fixture, app, request, createDuty, confirm, setTime: (value: string) => { time = new Date(value); } };
}
function draft(f: CompanyFixture) {
  return { dutyDate: '2026-10-04', startsAt: '2026-10-04T09:00:00+09:00', endsAt: '2026-10-04T18:00:00+09:00', requiredCount: 1,
    assignments: [{ officerId: f.officerId, isLeader: true }], qualificationRequirements: [] as { qualificationId: string; requiredQualifiedCount: number }[],
    availabilityCheck: { confirmed: true, note: '電話確認' }, travelRestCheck: { confirmed: true, note: '移動と休息確認' }, reason: '試験下書き' };
}
const data = (response: { data: Row | Row[] }) => response.data as Row;

test('saved masters persist, strict inputs and optimistic updates reject conflicts without losing values', async () => {
  const s = await setup();
  const created = await s.request('POST', '/api/officers', { code: 'g010', name: '試験 太郎', branchId: s.fixture.headquartersId, internalMemo: '非公開' }, 'dispatcher');
  assert.equal(created.status, 201); const id = data(created).id;
  const fetched = data(await s.request('GET', `/api/officers/${id}`));
  assert.equal(fetched.code, 'G010'); assert.equal(fetched.name, '試験 太郎');
  const update = await s.request('PATCH', `/api/officers/${id}`, { name: '更新 太郎', expectedVersion: 1, reason: '訂正' }); assert.equal(update.status, 200);
  const conflict = await s.request('PATCH', `/api/officers/${id}`, { name: '古い更新', expectedVersion: 1, reason: '訂正' }); assert.equal(conflict.error, 'VERSION_CONFLICT');
  assert.equal(data(await s.request('GET', `/api/officers/${id}`)).name, '更新 太郎');
  const history = (await s.request('GET', `/api/audit-events?entityId=${id}`)).data as Row[];
  const change = history.find((entry) => entry.action === 'updated'); assert.ok(change);
  assert.equal(change.actorName, '試験 admin'); assert.equal((change.beforeData as Row).name, '試験 太郎'); assert.equal((change.afterData as Row).name, '更新 太郎');
  assert.equal((await s.request('GET', '/api/audit-events', undefined, 'viewer')).status, 403);
  assert.equal((await s.request('POST', '/api/officers', { code: 'G011', name: '試験', branchId: s.fixture.headquartersId, companyId: randomUUID() })).status, 400);
  assert.equal((await s.request('POST', '/api/officers', { code: 'G010', name: '重複', branchId: s.fixture.headquartersId })).error, 'DUPLICATE_CODE');
  const viewer = data(await s.request('GET', `/api/officers/${id}`, undefined, 'viewer'));
  assert.equal(viewer.internalMemo, undefined); assert.equal(viewer.businessPhone, undefined);
  assert.equal((await s.request('PATCH', `/api/officers/${id}`, { name: '不可', expectedVersion: 2, reason: '試験' }, 'viewer')).status, 403);
});

test('company, branch and client scopes protect lists, details, candidates and writes', async () => {
  const s = await setup(); const other = await seedTestCompany(admin);
  for (const [path, id] of [['officers', other.officerId], ['clients', other.clientId], ['sites', other.siteId]]) assert.equal((await s.request('GET', `/api/${path}/${id}`)).status, 404);
  assert.equal((await s.request('GET', `/api/officers/${s.fixture.branchOfficerId}`, undefined, 'dispatcher')).status, 404);
  assert.equal((await s.request('GET', `/api/officers?branchId=${s.fixture.branchId}`, undefined, 'dispatcher')).status, 404);
  assert.equal((await s.request('POST', '/api/officers', { code: 'G099', name: '支店侵入', branchId: s.fixture.branchId }, 'dispatcher')).status, 404);
  const client = data(await s.request('POST', '/api/clients', { code: 'C099', name: '本店限定' }));
  assert.equal((await s.request('PUT', `/api/clients/${client.id}/branch-access`, { branchIds: [s.fixture.headquartersId], expectedVersion: 1, reason: '利用拠点設定' })).status, 200);
  assert.equal((await s.request('GET', `/api/clients/${client.id}`, undefined, 'dispatcher')).status, 200);
  assert.equal((await s.request('GET', `/api/clients/${client.id}`, undefined, 'branchDispatcher')).status, 404);
  const clients = await s.request('GET', '/api/clients', undefined, 'branchDispatcher'); assert.equal(clients.total, 1);
  assert.equal(data(await s.request('GET', `/api/clients/${s.fixture.clientId}`, undefined, 'dispatcher')).branchIds, undefined);
  assert.equal((await s.request('POST', '/api/sites', { code: 'S099', name: '不正関連', branchId: s.fixture.branchId, clientId: client.id, securityType: 'traffic', location: '架空地点', meetingPoint: '入口' }, 'branchDispatcher')).status, 404);
  assert.equal((await s.request('GET', '/api/officers', undefined, 'guard')).status, 403);
  assert.equal((await s.request('GET', '/api/clients', undefined, 'guard')).status, 403);
  assert.equal((await s.request('GET', '/api/officers/malformed')).status, 404);
});

test('concurrent officer registrations serialize at quota, leave counts, retired frees a place and restoration checks quota', async () => {
  const s = await setup();
  for (let i = 0; i < 7; i++) assert.equal((await s.request('POST', '/api/officers', { code: `Q${i}`, name: `試験 ${i}`, branchId: s.fixture.headquartersId, status: i === 0 ? 'leave' : 'active' })).status, 201);
  const last = await Promise.all([0, 1].map((i) => s.request('POST', '/api/officers', { code: `LAST${i}`, name: '残り一枠', branchId: s.fixture.headquartersId })));
  assert.deepEqual(last.map((item) => item.status).sort(), [201, 409]); assert.equal(last.find((item) => item.status === 409)?.error, 'QUOTA_EXCEEDED');
  assert.equal((await s.request('PATCH', `/api/officers/${s.fixture.secondOfficerId}`, { status: 'retired', expectedVersion: 1, reason: '退職' })).status, 200);
  assert.equal((await s.request('POST', '/api/officers', { code: 'FREED', name: '補充', branchId: s.fixture.headquartersId })).status, 201);
  assert.equal((await s.request('PATCH', `/api/officers/${s.fixture.secondOfficerId}`, { status: 'active', expectedVersion: 2, reason: '復帰' })).error, 'QUOTA_EXCEEDED');
  assert.equal((await s.request('GET', '/api/me/officer', undefined, 'secondGuard')).status, 401);
  assert.equal((await s.request('POST', '/api/officers', { code: 'BR_EXTRA', name: '独立枠', branchId: s.fixture.branchId })).status, 201);
});

test('incomplete draft never reaches guard, confirms only with people, leader and explicit checks', async () => {
  const s = await setup(); const slot = await s.createDuty({ requiredCount: 2 });
  assert.equal(((data(await s.request('GET', `/api/duty-slots/${slot.id}`)).draft as Row).warnings as Row[])[0].code, 'STAFF_SHORTAGE');
  assert.deepEqual((await s.request('GET', '/api/me/duties?from=2026-10-04&to=2026-10-04', undefined, 'guard')).data, []);
  assert.equal((await s.confirm(slot)).error, 'DUTY_CONDITIONS_NOT_MET');
  const summary = data(await s.request('GET', '/api/assignment-summary?date=2026-10-04'));
  assert.equal(summary.publishedAssignedCount, 0); assert.equal(summary.draftShortageCount, 1);
  const invalidChecks: Array<[string, Partial<ReturnType<typeof draft>>]> = [['leader', { assignments: [{ officerId: s.fixture.officerId, isLeader: false }] }], ['available', { availabilityCheck: { confirmed: false, note: '' } }], ['rest', { travelRestCheck: { confirmed: false, note: '' } }]];
  for (const [name, change] of invalidChecks) {
    const invalid = await s.createDuty(change); assert.equal((await s.confirm(invalid)).error, 'DUTY_CONDITIONS_NOT_MET', name);
  }
  const valid = await s.createDuty(); assert.equal((await s.confirm(valid, 'dispatcher')).status, 200);
  const guardDuties = (await s.request('GET', '/api/me/duties?from=2026-10-04&to=2026-10-04', undefined, 'guard')).data as Row[];
  assert.equal(guardDuties.length, 1); assert.equal(guardDuties[0].slotId, valid.id); assert.equal(guardDuties[0].state, 'confirmed');
  assert.equal(guardDuties[0].assignments, undefined); assert.equal(guardDuties[0].reason, undefined);
  const site = data(await s.request('GET', `/api/me/duties/${valid.id}/site`, undefined, 'guard'));
  assert.equal(site.meetingPoint, '東口の試験受付'); assert.equal(site.internalMemo, undefined); assert.equal(site.clientId, undefined);
  assert.equal((await s.request('GET', `/api/me/duties/${valid.id}`, undefined, 'secondGuard')).status, 404);
});

test('night shifts detect concurrent overlap and accept touching end/start boundaries', async () => {
  const s = await setup();
  const night = await s.createDuty({ startsAt: '2026-10-04T22:00:00+09:00', endsAt: '2026-10-05T06:00:00+09:00' });
  const overlap = await s.createDuty({ dutyDate: '2026-10-05', startsAt: '2026-10-05T05:00:00+09:00', endsAt: '2026-10-05T09:00:00+09:00' });
  const results = await Promise.all([s.confirm(night), s.confirm(overlap)]);
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]); assert.equal(results.find((item) => item.status === 409)?.error, 'DUTY_OVERLAP');
  const winner = results[0].status === 200 ? night : overlap;
  const cancel = await s.request('POST', `/api/duty-slots/${winner.id}/cancel`, { expectedVersion: 2, reason: '試験解除' }); assert.equal(cancel.status, 200);
  assert.equal((await s.confirm(night)).status, results[0].status === 200 ? 409 : 200);
  if (results[0].status !== 200) {
    const adjacent = await s.createDuty({ dutyDate: '2026-10-05', startsAt: '2026-10-05T06:00:00+09:00', endsAt: '2026-10-05T09:00:00+09:00' });
    assert.equal((await s.confirm(adjacent)).status, 200);
  } else {
    const fresh = await s.createDuty({ startsAt: '2026-10-04T22:00:00+09:00', endsAt: '2026-10-05T06:00:00+09:00' }); assert.equal((await s.confirm(fresh)).status, 200);
    const adjacent = await s.createDuty({ dutyDate: '2026-10-05', startsAt: '2026-10-05T06:00:00+09:00', endsAt: '2026-10-05T09:00:00+09:00' }); assert.equal((await s.confirm(adjacent)).status, 200);
  }
});

test('qualification and contract cover the entire night including exact next-midnight expiry', async () => {
  const s = await setup();
  const qualification = await s.request('PUT', `/api/officers/${s.fixture.officerId}/qualifications`, { qualifications: [{ qualificationId: s.fixture.qualificationId, verificationStatus: 'verified', validFrom: '2026-10-01', validThrough: '2026-10-04' }], expectedVersion: 1, reason: '資格確認' }); assert.equal(qualification.status, 200);
  const required = [{ qualificationId: s.fixture.qualificationId, requiredQualifiedCount: 1 }];
  const invalid = await s.createDuty({ startsAt: '2026-10-04T22:00:00+09:00', endsAt: '2026-10-05T06:00:00+09:00', qualificationRequirements: required });
  assert.equal((await s.confirm(invalid)).error, 'DUTY_CONDITIONS_NOT_MET');
  const exact = await s.createDuty({ startsAt: '2026-10-04T22:00:00+09:00', endsAt: '2026-10-05T00:00:00+09:00', qualificationRequirements: required }); assert.equal((await s.confirm(exact)).status, 200);
  assert.equal((await s.request('PUT', `/api/officers/${s.fixture.officerId}/qualifications`, { qualifications: [{ qualificationId: s.fixture.qualificationId, verificationStatus: 'verified', validFrom: '2026-10-01', validThrough: '2026-10-05' }], expectedVersion: 2, reason: '有効期間を延長' })).status, 200);
  assert.equal((await s.request('PUT', `/api/officers/${s.fixture.officerId}/qualifications`, { qualifications: [], expectedVersion: 3, reason: '資格取消' })).error, 'ONGOING_DUTIES');
  assert.equal((await s.request('PATCH', `/api/qualifications/${s.fixture.qualificationId}`, { status: 'inactive', expectedVersion: 1, reason: '無効化' })).error, 'ONGOING_DUTIES');
  assert.equal((await s.request('PATCH', `/api/sites/${s.fixture.siteId}`, { contractFrom: '2026-10-01', contractThrough: '2026-10-03', expectedVersion: 1, reason: '短縮' })).error, 'ONGOING_DUTIES');
});

test('failed revision publication rolls back reservations, then replacement revokes old guard site access and keeps old overview', async () => {
  const s = await setup(); const original = await s.createDuty(); assert.equal((await s.confirm(original)).status, 200);
  const occupied = await s.createDuty({ assignments: [{ officerId: s.fixture.secondOfficerId, isLeader: true }] }); assert.equal((await s.confirm(occupied)).status, 200);
  const revision = data(await s.request('POST', `/api/duty-slots/${original.id}/revisions`, { expectedVersion: 2, reason: '交代' }));
  assert.equal((await s.request('PUT', `/api/duty-slots/${original.id}/draft`, { ...draft(s.fixture), assignments: [{ officerId: s.fixture.secondOfficerId, isLeader: true }], draftVersionId: revision.draftVersionId, expectedVersion: 3, reason: '交代' })).status, 200);
  const failed = await s.confirm({ ...revision, version: 4 }); assert.equal(failed.error, 'DUTY_OVERLAP');
  const current = data(await s.request('GET', `/api/duty-slots/${original.id}`)); assert.equal(current.version, 4); assert.equal((current.published as Row).id, original.draftVersionId);
  assert.equal((await s.request('GET', `/api/me/duties/${original.id}/site`, undefined, 'guard')).status, 200);
  const reservations = await admin.query('SELECT officer_id FROM officer_reservations WHERE company_id=$1 AND slot_id=$2', [s.fixture.companyId, original.id]); assert.equal(reservations.rows[0].officer_id, s.fixture.officerId);
  assert.equal((await s.request('POST', `/api/duty-slots/${occupied.id}/cancel`, { expectedVersion: 2, reason: '交代のため解除' })).status, 200);
  assert.equal((await s.confirm({ ...revision, version: 4 })).status, 200);
  const removed = data(await s.request('GET', `/api/me/duties/${original.id}`, undefined, 'guard')); assert.equal(removed.state, 'removed'); assert.equal(removed.publishedVersionId, original.draftVersionId);
  assert.equal((await s.request('GET', `/api/me/duties/${original.id}/site`, undefined, 'guard')).status, 404);
  assert.equal((await s.request('GET', `/api/me/duties/${original.id}/site`, undefined, 'secondGuard')).status, 200);
  const overview = data(await s.request('GET', '/api/assignment-summary?date=2026-10-04')); assert.equal(overview.publishedAssignedCount, 1); assert.equal(overview.draftSlotCount, 0);
});

test('discard, cancel and draft-only cancellation retain versions without exposing unpublished candidates', async () => {
  const s = await setup(); const slot = await s.createDuty(); assert.equal((await s.confirm(slot)).status, 200);
  const revision = data(await s.request('POST', `/api/duty-slots/${slot.id}/revisions`, { expectedVersion: 2, reason: '改訂案' }));
  assert.equal((await s.request('POST', `/api/duty-slots/${slot.id}/discard-draft`, { expectedVersion: revision.version, reason: '案破棄' })).status, 200);
  assert.equal(data(await s.request('GET', `/api/me/duties/${slot.id}`, undefined, 'guard')).state, 'confirmed');
  assert.equal((await s.request('POST', `/api/duty-slots/${slot.id}/cancel`, { expectedVersion: 4, reason: '勤務取消' })).status, 200);
  assert.equal(data(await s.request('GET', `/api/me/duties/${slot.id}`, undefined, 'guard')).state, 'cancelled');
  assert.equal((await s.request('GET', `/api/me/duties/${slot.id}/site`, undefined, 'guard')).status, 404);
  const history = data(await s.request('GET', `/api/duty-slots/${slot.id}`)).history as Row[];
  assert.deepEqual(history.map((item) => item.state), ['cancelled', 'discarded']);
  const neverPublic = await s.createDuty({ assignments: [{ officerId: s.fixture.secondOfficerId, isLeader: true }] });
  assert.equal((await s.request('POST', `/api/duty-slots/${neverPublic.id}/cancel`, { expectedVersion: 1, reason: '初回取消' })).status, 200);
  assert.equal((await s.request('GET', `/api/me/duties/${neverPublic.id}`, undefined, 'secondGuard')).status, 404);
});

test('idempotent concurrent replay returns same result, rejects changed input and rechecks current role and branch', async () => {
  const s = await setup(); const key = randomUUID(); const body = { code: 'REPLAY', name: '再送試験', branchId: s.fixture.headquartersId };
  const replay = await Promise.all([s.request('POST', '/api/officers', body, 'dispatcher', key), s.request('POST', '/api/officers', body, 'dispatcher', key)]);
  assert.deepEqual(replay[0], replay[1]); assert.equal(replay[0].status, 201);
  assert.equal((await s.request('POST', '/api/officers', { ...body, name: '異なる入力' }, 'dispatcher', key)).error, 'IDEMPOTENCY_CONFLICT');
  const operation = data(await s.request('GET', `/api/operations/${key}`, undefined, 'dispatcher')); assert.equal(operation.status, 'succeeded');
  assert.equal((await s.request('GET', `/api/operations/${key}`, undefined, 'admin')).status, 404);
  await admin.query("UPDATE memberships SET role='viewer',auth_version=auth_version+1 WHERE id=$1", [s.fixture.actors.dispatcher.principal.membershipId]);
  s.fixture.actors.dispatcher.principal.role = 'viewer';
  assert.equal((await s.request('POST', '/api/officers', body, 'dispatcher', key)).status, 403);
  assert.equal((await s.request('GET', `/api/operations/${key}`, undefined, 'dispatcher')).status, 404);
});

test('concurrent edits use one shared slot version and successful confirm replay never publishes twice', async () => {
  const s = await setup(); const slot = await s.createDuty();
  const edit = { ...draft(s.fixture), expectedVersion: 1, draftVersionId: slot.draftVersionId };
  const edits = await Promise.all([s.request('PUT', `/api/duty-slots/${slot.id}/draft`, edit), s.request('PUT', `/api/duty-slots/${slot.id}/draft`, { ...edit, reason: '他担当の編集' })]);
  assert.deepEqual(edits.map((item) => item.status).sort(), [200, 409]);
  const key = randomUUID(); const published = await s.confirm({ ...slot, version: 2 }, 'admin', key); assert.equal(published.status, 200);
  assert.deepEqual(await s.confirm({ ...slot, version: 2 }, 'admin', key), published);
  const rows = await admin.query('SELECT count(*)::int AS count FROM audit_events WHERE company_id=$1 AND entity_id=$2 AND action=$3', [s.fixture.companyId, slot.id, 'confirmed']); assert.equal(rows.rows[0].count, 1);
});

test('retirement, site closure and client access removal protect public duties and history', async () => {
  const s = await setup(); const slot = await s.createDuty(); assert.equal((await s.confirm(slot)).status, 200);
  assert.equal((await s.request('PATCH', `/api/officers/${s.fixture.officerId}`, { status: 'leave', expectedVersion: 1, reason: '休職' })).error, 'ONGOING_DUTIES');
  assert.equal((await s.request('PATCH', `/api/sites/${s.fixture.siteId}`, { status: 'closed', expectedVersion: 1, reason: '終了' })).error, 'ONGOING_DUTIES');
  assert.equal((await s.request('PATCH', `/api/clients/${s.fixture.clientId}`, { status: 'inactive', expectedVersion: 1, reason: '停止' })).error, 'ONGOING_DUTIES');
  assert.equal((await s.request('PUT', `/api/clients/${s.fixture.clientId}/branch-access`, { branchIds: [s.fixture.branchId], expectedVersion: 1, reason: '解除' })).error, 'CLIENT_ACCESS_IN_USE');
  assert.equal((await s.request('POST', `/api/duty-slots/${slot.id}/cancel`, { expectedVersion: 2, reason: '取消' })).status, 200);
  assert.equal((await s.request('PATCH', `/api/officers/${s.fixture.officerId}`, { status: 'retired', expectedVersion: 1, reason: '退職' })).status, 200);
  assert.equal((await s.request('GET', '/api/me/officer', undefined, 'guard')).status, 401);
  assert.equal(data(await s.request('GET', `/api/duty-slots/${slot.id}`)).state, 'cancelled');
  const sessions = await admin.query('SELECT revoked_at FROM app_sessions WHERE user_id=$1', [s.fixture.actors.guard.principal.userId]); assert.ok(sessions.rows[0].revoked_at);
  const suspended = await admin.query('SELECT action,actor_id FROM auth_audit_events WHERE company_id=$1 AND target_id=$2', [s.fixture.companyId, s.fixture.actors.guard.principal.membershipId]);
  assert.ok(suspended.rows.some((event) => event.action === 'officer_retired_suspension' && event.actor_id === s.fixture.actors.admin.principal.userId));
});

test('publication races with officer leave, site closure and qualification removal commit exactly one compatible outcome', async () => {
  for (const kind of ['officer', 'site', 'qualification']) {
    const s = await setup(); let options = {};
    if (kind === 'qualification') {
      assert.equal((await s.request('PUT', `/api/officers/${s.fixture.officerId}/qualifications`, { qualifications: [{ qualificationId: s.fixture.qualificationId, verificationStatus: 'verified' }], expectedVersion: 1, reason: '資格確認' })).status, 200);
      options = { qualificationRequirements: [{ qualificationId: s.fixture.qualificationId, requiredQualifiedCount: 1 }] };
    }
    const slot = await s.createDuty(options);
    const change = kind === 'officer' ? () => s.request('PATCH', `/api/officers/${s.fixture.officerId}`, { status: 'leave', expectedVersion: 1, reason: '休職' }) :
      kind === 'site' ? () => s.request('PATCH', `/api/sites/${s.fixture.siteId}`, { status: 'closed', expectedVersion: 1, reason: '現場終了' }) :
        () => s.request('PUT', `/api/officers/${s.fixture.officerId}/qualifications`, { qualifications: [], expectedVersion: 2, reason: '資格取消' });
    const outcomes = await Promise.all([s.confirm(slot), change()]);
    assert.deepEqual(outcomes.map((response) => response.status).sort(), [200, 409], kind);
    const current = data(await s.request('GET', `/api/duty-slots/${slot.id}`));
    assert.equal(current.state, outcomes[0].status === 200 ? 'confirmed' : 'draft');
  }
});

test('server time checks old and new starts and ended boundary, guard site info expires exactly at end', async () => {
  const s = await setup(); const slot = await s.createDuty(); assert.equal((await s.confirm(slot)).status, 200);
  s.setTime('2026-10-04T00:00:00Z');
  assert.equal((await s.request('POST', `/api/duty-slots/${slot.id}/revisions`, { expectedVersion: 2, reason: '開始時刻' }, 'dispatcher')).status, 403);
  const revision = data(await s.request('POST', `/api/duty-slots/${slot.id}/revisions`, { expectedVersion: 2, reason: '開始後変更' }));
  assert.equal((await s.request('PUT', `/api/duty-slots/${slot.id}/draft`, { ...draft(s.fixture), startsAt: '2026-10-04T10:00:00+09:00', draftVersionId: revision.draftVersionId, expectedVersion: 3, reason: '未来へ変更' }, 'dispatcher')).status, 403);
  s.setTime('2026-10-04T09:00:00Z');
  assert.equal((await s.request('POST', `/api/duty-slots/${slot.id}/cancel`, { expectedVersion: 3, reason: '終了後変更' })).error, 'DUTY_ALREADY_ENDED');
  assert.equal((await s.request('GET', `/api/me/duties/${slot.id}/site`, undefined, 'guard')).status, 404);
  assert.equal(data(await s.request('GET', `/api/me/duties/${slot.id}`, undefined, 'guard')).state, 'confirmed');
  assert.equal((await s.createDuty({ dutyDate: '2026-10-05', startsAt: '2026-10-05T09:00:00+09:00', endsAt: '2026-10-05T18:00:00+09:00' })).state, 'draft');
  assert.equal((await s.request('POST', '/api/duty-slots', { siteId: s.fixture.siteId, ...draft(s.fixture) })).error, 'PAST_DUTY_NOT_ALLOWED');
});

test('RLS requires context, clears pooled scope and rejects cross-company related foreign keys; audit cannot be mutated', async () => {
  const s = await setup(); const other = await seedTestCompany(admin);
  assert.equal((await application.query('SELECT * FROM officers')).rowCount, 0);
  await withTenant(application, s.fixture.actors.admin.principal, async (db) => {
    assert.equal((await db.query('SELECT 1 FROM officers WHERE company_id=$1', [other.companyId])).rowCount, 0);
    assert.equal((await db.query('SELECT 1 FROM officers WHERE company_id=$1', [s.fixture.companyId])).rowCount, 3);
  });
  await withTenant(application, other.actors.admin.principal, async (db) => assert.equal((await db.query('SELECT 1 FROM officers WHERE company_id=$1', [s.fixture.companyId])).rowCount, 0));
  assert.equal((await application.query('SELECT * FROM officers')).rowCount, 0);
  await assert.rejects(admin.query('INSERT INTO officer_qualifications(company_id,officer_id,qualification_id,verification_status) VALUES($1,$2,$3,$4)', [s.fixture.companyId, other.officerId, s.fixture.qualificationId, 'verified']), (error: unknown) => (error as { code: string }).code === '23503');
  await assert.rejects(withTenant(application, s.fixture.actors.admin.principal, (db) => db.query('UPDATE audit_events SET reason=$1', ['改ざん'])), (error: unknown) => (error as { code: string }).code === '42501');
  await assert.rejects(application.query('CREATE TABLE forbidden_table(id int)'), (error: unknown) => (error as { code: string }).code === '42501');
});

test('database cannot reserve draft assignments or modify public contents, and same-company draft related IDs cannot cross branches', async () => {
  const s = await setup(); const slot = await s.createDuty();
  await assert.rejects(admin.query(`INSERT INTO officer_reservations(company_id,slot_id,revision_id,officer_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6)`, [s.fixture.companyId, slot.id, slot.draftVersionId, s.fixture.officerId, '2026-10-04T09:00:00+09:00', '2026-10-04T18:00:00+09:00']), (error: unknown) => (error as { code: string }).code === '23514');
  assert.equal((await s.confirm(slot)).status, 200);
  await assert.rejects(admin.query('UPDATE duty_revisions SET required_count=99 WHERE id=$1', [slot.draftVersionId]), (error: unknown) => (error as { code: string }).code === '23514');
  await assert.rejects(admin.query('UPDATE duty_assignments SET is_leader=false WHERE revision_id=$1', [slot.draftVersionId]), (error: unknown) => (error as { code: string }).code === '23514');
  await assert.rejects(admin.query("UPDATE duty_revisions SET state='draft' WHERE id=$1", [slot.draftVersionId]), (error: unknown) => (error as { code: string }).code === '23514');
  assert.equal((await s.request('POST', `/api/duty-slots/${slot.id}/cancel`, { expectedVersion: 2, reason: '旧版の不変性確認' })).status, 200);
  const nextDraft = await s.createDuty({ assignments: [] });
  await assert.rejects(admin.query('UPDATE duty_assignments SET revision_id=$1 WHERE revision_id=$2', [nextDraft.draftVersionId, slot.draftVersionId]), (error: unknown) => (error as { code: string }).code === '23514');
  assert.equal((await s.request('POST', '/api/duty-slots', { siteId: s.fixture.siteId, ...draft(s.fixture), assignments: [{ officerId: s.fixture.branchOfficerId, isLeader: true }] })).status, 404);
  assert.equal((await s.request('GET', '/api/me/duties?from=2026-01-01&to=2026-12-31', undefined, 'guard')).status, 400);
  assert.equal((await s.request('GET', '/api/duty-slots?from=2026-10-04&to=2026-10-04&companyId=unknown')).status, 400);
});
