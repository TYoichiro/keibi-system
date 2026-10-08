import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { createApp } from '../src/app.js';
import { absoluteSessionExpiry, createGoogleProvider, csrfToken, randomToken, tokenHash, verifyGoogleToken, type GoogleProvider } from '../src/auth/google.js';
import { runOperator, operatorSchema } from '../src/auth/operator.js';
import type { InvitationMessage } from '../src/auth/mail.js';
import { withTenant } from '../src/auth/tenant.js';
import { createAuthenticator } from '../src/auth/service.js';
import { adminPool, applicationPool } from './database.js';
import { seedTestCompany, TEST_NOW, type TestActor } from './fixtures.js';

const admin = adminPool(); const pool = applicationPool();
after(async () => { await Promise.all([admin.end(), pool.end()]); });
const origin = 'http://localhost:5173';
const options = { pool, checkDatabase: () => pool.query('SELECT 1'), allowedOrigins: [origin], clientAddress: () => '127.0.0.1', log: () => undefined, rateLimitPoints: 10000 };
type TestApp = ReturnType<typeof createApp>;
async function setup() {
  const fixture = await seedTestCompany(admin);
  let current = new Date(TEST_NOW);
  let identity = { subject: `new-sub-${randomUUID()}`, email: `new-${randomUUID()}@gmail.com`, mfa: false };
  const messages: InvitationMessage[] = [];
  const google: GoogleProvider = { authorizationUrl: ({ state, nonce, verifier }) => {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ state, nonce, code_challenge: tokenHash(verifier) }).toString(); return url.toString();
  }, exchange: async () => identity };
  const app = createApp({ ...options, auth: { appOrigin: origin, google, mailer: { send: async (message) => { messages.push(message); } }, now: () => current } });
  return { fixture, app, messages, setTime: (date: Date) => { current = date; }, setIdentity: (next: typeof identity) => { identity = next; } };
}
async function request(app: TestApp, actor: TestActor, path: string, method = 'GET', body?: unknown, key = randomUUID()) {
  return app.request(path, { method, headers: { Origin: origin, Cookie: `keibi_session=${actor.cookie}`,
    'X-CSRF-Token': actor.csrfToken, 'Content-Type': 'application/json', 'Idempotency-Key': key },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function start(app: TestApp, invitation?: string, extra = '') {
  const response = await app.request(`/api/auth/google/start?returnTo=%2F${invitation ? `&invitation=${invitation}` : ''}${extra}`, { headers: { Referer: `${origin}/login`, 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(response.status, 302);
  const location = response.headers.get('Location')!;
  const state = new URL(location).searchParams.get('state')!;
  const cookie = /keibi_oauth=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
  assert.ok(cookie);
  return { response, state, cookie };
}
async function callback(app: TestApp, transaction: { state: string; cookie: string }, state = transaction.state) {
  return app.request(`/api/auth/google/callback?state=${state}&code=test-code`, { headers: { Cookie: `keibi_oauth=${transaction.cookie}`, 'Sec-Fetch-Site': 'cross-site' } });
}

test('Google token signature, issuer, audience, nonce, lifetime and account scope are verified', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'test';
  const keys = createLocalJWKSet({ keys: [jwk] });
  const claims: JWTPayload = { iss: 'https://accounts.google.com', sub: '123456789', aud: 'client', iat: TEST_NOW.getTime()/1000,
    exp: TEST_NOW.getTime()/1000 + 300, nonce: 'nonce', email: '本人@gmail.com', email_verified: true, amr: ['pwd', 'mfa'] };
  const sign = (overrides: JWTPayload = {}) => new SignJWT({ ...claims, ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey);
  const verify = (token: string) => verifyGoogleToken(token, { audience: 'client', nonce: 'nonce', now: TEST_NOW, keys });
  assert.deepEqual(await verify(await sign()), { subject: '123456789', email: '本人@gmail.com', mfa: true });
  assert.equal((await verify(await sign({ amr: undefined }))).mfa, false);
  assert.equal((await verify(await sign({ iss: 'accounts.google.com', email: 'user@company.example', hd: 'company.example' }))).subject, '123456789');
  for (const override of [{ iss: 'https://attacker.example' }, { aud: 'other-client' }, { nonce: 'other' }, { exp: TEST_NOW.getTime()/1000 - 6 },
    { email_verified: false }, { email: 'user@external.example', hd: undefined }, { azp: 'other-client' }, { iat: TEST_NOW.getTime()/1000 + 60 }, { sub: '' }]) {
    await assert.rejects(verify(await sign(override)));
  }
  const token = await sign();
  await assert.rejects(verify(token.slice(0,-5) + 'xxxxx'));
  await assert.rejects(verify(await sign({ aud: ['client','another'], azp: undefined })));
});

test('Google authorization uses S256 and limited scopes without offline access', () => {
  const provider = createGoogleProvider({ clientId: 'client', clientSecret: 'secret', redirectUri: `${origin}/api/auth/google/callback` });
  const url = new URL(provider.authorizationUrl({ state: 'state', nonce: 'nonce', verifier: 'verifier' }));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'openid email');
  assert.equal(url.searchParams.has('access_type'), false);
  assert.deepEqual(JSON.parse(url.searchParams.get('claims')!), { id_token: { amr: { essential: true }, auth_time: { essential: true } } });
});

test('calendar-month expiry clamps month end in Japan and handles leap years', () => {
  for (const [startAt, endAt] of [['2026-10-31T00:00:00Z','2026-11-30T00:00:00Z'], ['2028-01-31T14:30:00Z','2028-02-29T14:30:00Z'],
    ['2026-12-31T14:59:00Z','2027-01-31T14:59:00Z'], ['2026-01-31T15:00:00Z','2026-02-28T15:00:00Z']]) {
    assert.equal(absoluteSessionExpiry(new Date(startAt)).toISOString(), new Date(endAt).toISOString());
  }
});

test('session identity resolves from the cookie, with CSRF required for mutations', async () => {
  const { app, fixture } = await setup(); const actor = fixture.actors.admin;
  assert.equal((await app.request('/api/me')).status, 401);
  const response = await request(app, actor, '/api/me');
  assert.equal(response.status, 200); const { data } = await response.json() as { data: { companyId: string; csrfToken: string } };
  assert.equal(data.companyId, fixture.companyId); assert.equal(data.csrfToken, actor.csrfToken);
  for (const token of ['', 'f'.repeat(64), 'é'.repeat(64)]) {
    const denied = await app.request('/api/auth/activity', { method: 'POST', headers: { Origin: origin, Cookie: `keibi_session=${actor.cookie}`, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: '{}' });
    assert.equal(denied.status, 403);
  }
  assert.equal((await request(app, actor, '/api/auth/activity', 'POST', {})).status, 200);
});

test('automatic GETs do not extend idle expiry and activity cannot revive expired sessions', async () => {
  const { app, fixture, setTime } = await setup(); const actor = fixture.actors.admin;
  setTime(new Date(TEST_NOW.getTime()+23*3600000)); assert.equal((await request(app, actor, '/api/me')).status, 200);
  setTime(new Date(TEST_NOW.getTime()+24*3600000));
  assert.equal((await request(app, actor, '/api/me')).status, 401);
  assert.equal((await request(app, actor, '/api/auth/activity','POST',{})).status, 401);
  const s = await admin.query('SELECT last_activity_at FROM app_sessions WHERE user_id=$1', [actor.principal.userId]);
  assert.equal(s.rows[0].last_activity_at.toISOString(), TEST_NOW.toISOString());
});

test('explicit activity extends idle expiry but never extends absolute expiry', async () => {
  const { app, fixture, setTime } = await setup(); const actor = fixture.actors.admin;
  await admin.query('UPDATE app_sessions SET absolute_expires_at=$2 WHERE user_id=$1', [actor.principal.userId, new Date(TEST_NOW.getTime()+25*3600000)]);
  setTime(new Date(TEST_NOW.getTime()+23*3600000)); assert.equal((await request(app, actor, '/api/auth/activity','POST',{})).status, 200);
  setTime(new Date(TEST_NOW.getTime()+24*3600000)); assert.equal((await request(app, actor, '/api/me')).status, 200);
  setTime(new Date(TEST_NOW.getTime()+25*3600000)); assert.equal((await request(app, actor, '/api/me')).status, 401);
});

test('logout-all invalidates every session for the user without affecting other users', async () => {
  const { app, fixture } = await setup(); const actor = fixture.actors.admin;
  const other = 'x'.repeat(43);
  await admin.query('INSERT INTO app_sessions(id,token_hash,user_id,membership_id,auth_version,created_at,last_activity_at,absolute_expires_at) VALUES($1,$2,$3,$4,1,$5,$5,$6)', [randomUUID(),tokenHash(other),actor.principal.userId,actor.principal.membershipId,TEST_NOW,absoluteSessionExpiry(TEST_NOW)]);
  assert.equal((await request(app, actor, '/api/auth/logout-all','POST',{})).status, 200);
  assert.equal((await request(app, actor, '/api/me')).status, 401);
  assert.equal((await app.request('/api/me', { headers: { Cookie: `keibi_session=${other}` } })).status, 401);
  assert.equal((await request(app, fixture.actors.dispatcher, '/api/me')).status, 200);
});

test('OAuth rejects external starts, wrong browser, replay and expired state with a narrow callback exception', async () => {
  const { app, setTime } = await setup();
  assert.equal((await app.request('/api/auth/google/start')).status, 403);
  assert.equal((await app.request('/api/auth/google/start',{headers:{Origin:'https://attacker.example'}})).status, 403);
  const transaction = await start(app);
  const wrong = await callback(app, {...transaction,cookie:'z'.repeat(43)});
  assert.match(wrong.headers.get('Location')!, /AUTH_TRANSACTION_INVALID/);
  const denied = await callback(app, transaction);
  assert.match(denied.headers.get('Location')!, /AUTH_NOT_ALLOWED/);
  assert.match((await callback(app, transaction)).headers.get('Location')!, /AUTH_TRANSACTION_INVALID/);
  const expired = await start(app); setTime(new Date(TEST_NOW.getTime()+600000));
  assert.match((await callback(app, expired)).headers.get('Location')!, /AUTH_TRANSACTION_INVALID/);
  assert.equal((await app.request('/api/me',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
});

test('known subject logs in despite changed email and administrators require verified MFA evidence', async () => {
  const { app,fixture,setIdentity } = await setup(); const actor = fixture.actors.admin;
  const identity = await admin.query('SELECT subject FROM google_identities WHERE user_id=$1',[actor.principal.userId]);
  setIdentity({subject:identity.rows[0].subject,email:'changed@gmail.com',mfa:false});
  const rejected = await callback(app, await start(app));
  assert.match(rejected.headers.get('Location')!, /AUTH_POLICY_REQUIRED/);
  setIdentity({subject:identity.rows[0].subject,email:'changed@gmail.com',mfa:true});
  const accepted = await callback(app, await start(app,undefined,'&returnTo=https%3A%2F%2Fattacker.example'));
  assert.equal(accepted.headers.get('Location'),'/');
  assert.match(accepted.headers.get('Set-Cookie')!,/HttpOnly/); assert.match(accepted.headers.get('Set-Cookie')!,/SameSite=Lax/);
  const updated = await admin.query('SELECT email FROM google_identities WHERE user_id=$1',[actor.principal.userId]);
  assert.equal(updated.rows[0].email,'changed@gmail.com');
});

test('invitation delivery, email binding, one-time activation and token secrecy work together', async () => {
  const { app,fixture,messages,setIdentity } = await setup(); const invitationEmail=`invite-${randomUUID()}@gmail.com`;
  const create = await request(app, fixture.actors.admin, '/api/memberships','POST',{displayName:'試験 管制',invitationEmail,branchId:fixture.headquartersId,role:'dispatcher'});
  assert.equal(create.status,201); const {data}=await create.json() as { data: { delivery: string; membership: { id: string; version: number } } }; assert.equal(data.delivery,'sent');
  const token = new URL(messages[0].url).searchParams.get('invitation')!;
  const inspected=await app.request(`/api/auth/invitations/${token}`);assert.equal(inspected.status,200);
  assert.equal((await inspected.json() as {data:{invitationEmail:string}}).data.invitationEmail,invitationEmail);
  const stored = await admin.query('SELECT * FROM auth_invitations WHERE membership_id=$1',[data.membership.id]);
  assert.equal(stored.rows[0].token_hash,tokenHash(token)); assert.doesNotMatch(JSON.stringify(stored.rows),new RegExp(token));
  assert.equal(stored.rows[0].expires_at.getTime()-stored.rows[0].issued_at.getTime(),168*3600000);
  setIdentity({subject:`new-${randomUUID()}`,email:'wrong@gmail.com',mfa:false});
  assert.match((await callback(app,await start(app,token))).headers.get('Location')!,/AUTH_NOT_ALLOWED/);
  setIdentity({subject:`new-${randomUUID()}`,email:invitationEmail,mfa:false});
  const accepted=await callback(app,await start(app,token)); assert.equal(accepted.headers.get('Location'),'/');
  assert.equal((await app.request(`/api/auth/invitations/${token}`)).status,404);
  const updated=await admin.query('SELECT status FROM memberships WHERE id=$1',[data.membership.id]);assert.equal(updated.rows[0].status,'active');
});

test('reinvitation revokes the old link and exactly seven days expires the current link', async () => {
  const {app,fixture,messages,setTime}=await setup();
  const created=await request(app,fixture.actors.admin,'/api/memberships','POST',{displayName:'試験 閲覧',invitationEmail:`invite-${randomUUID()}@gmail.com`,branchId:fixture.headquartersId,role:'viewer'});
  const member=(await created.json() as { data: { membership: { id: string; version: number } } }).data.membership; const first=new URL(messages[0].url).searchParams.get('invitation')!;
  const renewed=await request(app,fixture.actors.admin,`/api/memberships/${member.id}/invitations`,'POST',{expectedVersion:member.version,reason:'再送依頼'});
  assert.equal(renewed.status,200);const second=new URL(messages[1].url).searchParams.get('invitation')!;
  assert.notEqual(first,second);assert.equal((await app.request(`/api/auth/invitations/${first}`)).status,404);
  setTime(new Date(TEST_NOW.getTime()+168*3600000-1));assert.equal((await app.request(`/api/auth/invitations/${second}`)).status,200);
  setTime(new Date(TEST_NOW.getTime()+168*3600000));assert.equal((await app.request(`/api/auth/invitations/${second}`)).status,404);
});

test('headquarters restriction, optimistic locking, increase-only quotas and idempotency are enforced', async () => {
  const {app,fixture}=await setup();const input={code:`TEST_${randomUUID().slice(0,8)}`,name:'試験支店'};const key=randomUUID();
  assert.equal((await request(app,fixture.actors.branchAdmin,'/api/branches','POST',input)).status,403);
  const first=await request(app,fixture.actors.admin,'/api/branches','POST',input,key);assert.equal(first.status,201);const data=(await first.json() as { data: { id: string; officerLimit: number } }).data;assert.equal(data.officerLimit,10);
  const replay=await request(app,fixture.actors.admin,'/api/branches','POST',input,key);assert.equal(replay.status,201);assert.equal((await replay.json() as { data: { id: string } }).data.id,data.id);
  assert.equal((await request(app,fixture.actors.admin,'/api/branches','POST',{...input,name:'異なる入力'},key)).status,409);
  const path=`/api/branches/${fixture.branchId}/officer-limit`;
  assert.equal((await request(app,fixture.actors.admin,path,'PATCH',{limit:11,expectedVersion:2,reason:'増枠'})).status,409);
  assert.equal((await request(app,fixture.actors.admin,path,'PATCH',{limit:10,expectedVersion:1,reason:'同じ枠'})).status,409);
  assert.equal((await request(app,fixture.actors.admin,path,'PATCH',{limit:11,expectedVersion:1,reason:'増枠'})).status,200);
  assert.equal((await request(app,fixture.actors.viewer,path,'PATCH',{limit:12,expectedVersion:2,reason:'増枠'})).status,403);
});

test('last administrator protection, membership changes and immediate session invalidation hold',async()=>{
  const {app,fixture}=await setup();const actor=fixture.actors.admin;
  await admin.query("UPDATE memberships SET status='suspended' WHERE company_id=$1 AND role='company_admin' AND id<>$2",[fixture.companyId,actor.principal.membershipId]);
  assert.equal((await request(app,actor,`/api/memberships/${actor.principal.membershipId}`,'PATCH',{expectedVersion:1,status:'suspended',reason:'停止'})).status,409);
  const target=fixture.actors.dispatcher;
  assert.equal((await request(app,actor,`/api/memberships/${target.principal.membershipId}`,'PATCH',{expectedVersion:1,status:'suspended',reason:'利用停止'})).status,200);
  assert.equal((await request(app,target,'/api/me')).status,401);
  assert.equal((await request(app,fixture.actors.viewer,'/api/memberships')).status,403);
});

test('Google replacement needs another administrator, records evidence and revokes all old access',async()=>{
  const {app,fixture,messages}=await setup();const target=fixture.actors.admin;
  const input={expectedVersion:1,invitationEmail:`replacement-${randomUUID()}@gmail.com`,reason:'Googleアカウント変更',identityEvidence:'対面で社員証と本人Googleメールを確認済み'};
  const path=`/api/memberships/${target.principal.membershipId}/google-link-change`;
  assert.equal((await request(app,target,path,'POST',input)).status,403);
  assert.equal((await request(app,fixture.actors.secondAdmin,path,'POST',input)).status,200);
  assert.equal((await request(app,target,'/api/me')).status,401);assert.equal(messages.length,1);
  const identities=await admin.query('SELECT revoked_at FROM google_identities WHERE user_id=$1',[target.principal.userId]);assert.ok(identities.rows[0].revoked_at);
  const evidence=await admin.query("SELECT evidence FROM auth_audit_events WHERE target_id=$1 AND action='google.replace.approve'",[target.principal.userId]);assert.equal(evidence.rows[0].evidence,input.identityEvidence);
});

test('RLS prevents cross-tenant reads and private auth table access; pool context resets',async()=>{
  const {fixture}=await setup();const another=await seedTestCompany(admin);
  assert.equal((await pool.query('SELECT * FROM memberships')).rowCount,0);
  await withTenant(pool,fixture.actors.admin.principal,async(db)=>{
    assert.equal((await db.query('SELECT * FROM memberships WHERE company_id=$1',[another.companyId])).rowCount,0);
    assert.equal((await db.query('SELECT * FROM branches WHERE company_id=$1',[another.companyId])).rowCount,0);
  });
  assert.equal((await pool.query('SELECT * FROM memberships')).rowCount,0);
  for(const table of ['app_sessions','google_identities','auth_oauth_transactions']) await assert.rejects(pool.query(`SELECT * FROM ${table}`));
  await assert.rejects(pool.query('DELETE FROM auth_audit_events'));
  const {app}=await setup();assert.equal((await request(app,fixture.actors.admin,`/api/branches/${another.branchId}/officer-limit`,'PATCH',{limit:11,expectedVersion:1,reason:'別会社'})).status,404);
});

test('invitation tokens and callback codes are absent from application logs',async()=>{
  const records:Record<string,unknown>[]=[];
  const app=createApp({...options,log:(entry)=>records.push(entry),auth:{appOrigin:origin,now:()=>TEST_NOW}});
  const token='a'.repeat(43);
  await app.request(`/api/auth/invitations/${token}`);
  await app.request('/api/auth/google/callback?code=secret-code&state=secret-state',{headers:{'Sec-Fetch-Site':'cross-site'}});
  assert.doesNotMatch(JSON.stringify(records),new RegExp(`${token}|secret-code|secret-state`));
});

test('operator bootstrap requires documented company and identity evidence and delivers an invitation',async()=>{
  const messages:InvitationMessage[]=[];
  assert.equal(operatorSchema.safeParse({command:'bootstrap'}).success,false);
  const data=await runOperator(admin,{command:'bootstrap',operator:'試験運営者',reason:'会社利用開始',identityEvidence:'対面で会社管理者本人を確認',companyEvidence:'会社契約と登記を確認',
    invitationEmail:`bootstrap-${randomUUID()}@gmail.com`,companyCode:`TEST_${randomUUID().slice(0,8).toUpperCase()}`,companyName:'運営者試験会社',displayName:'初期 管理者'},
  {appOrigin:origin,mailer:{send:async(message)=>{messages.push(message);}},now:TEST_NOW});
  assert.equal(data.delivery,'sent');assert.equal(messages.length,1);
  const invite=await admin.query('SELECT token_hash FROM auth_invitations WHERE membership_id=$1',[data.membershipId]);
  assert.equal(invite.rows[0].token_hash,tokenHash(new URL(messages[0].url).searchParams.get('invitation')!));
  const app=createApp({...options,auth:{appOrigin:origin,now:()=>TEST_NOW}});
  assert.equal((await app.request('/api/operator/bootstrap')).status,404);
});

test('operator recovery rejects another available administrator and audits confirmed total unavailability',async()=>{
  const {fixture,app}=await setup();const actor=fixture.actors.admin;
  const common={command:'recover' as const,operator:'試験 運営者',reason:'Googleアカウント回復不可',identityEvidence:'本人対面と新Googleメールを確認',companyEvidence:'会社代表者が復旧を承認',
    invitationEmail:`recover-${randomUUID()}@gmail.com`,companyId:fixture.companyId,membershipId:actor.principal.membershipId,confirmedUnavailable:'true' as const};
  const messages:InvitationMessage[]=[];
  const operatorOptions={appOrigin:origin,mailer:{send:async(message:InvitationMessage)=>{messages.push(message);}},now:TEST_NOW};
  await assert.rejects(runOperator(admin,{...common,mode:'sole-admin-account-replacement'},operatorOptions));
  assert.equal((await request(app,actor,'/api/me')).status,200);
  const result=await runOperator(admin,{...common,mode:'all-admins-unavailable'},operatorOptions);
  assert.equal(result.delivery,'sent');assert.equal(messages.length,1);
  for(const name of ['admin','secondAdmin','branchAdmin']) assert.equal((await request(app,fixture.actors[name],'/api/me')).status,401);
  const audit=await admin.query("SELECT evidence FROM auth_audit_events WHERE company_id=$1 AND action='operator.recover'",[fixture.companyId]);
  assert.equal(JSON.parse(audit.rows[0].evidence).confirmedUnavailable,'true');
});

test('a login invitation permits only one of two concurrent callbacks and preserves denial audit',async()=>{
  const {app,fixture,messages,setIdentity}=await setup();const invitationEmail=`concurrent-${randomUUID()}@gmail.com`;
  const response=await request(app,fixture.actors.admin,'/api/memberships','POST',{displayName:'競合 管制',invitationEmail,branchId:fixture.headquartersId,role:'dispatcher'});
  const member=(await response.json() as {data:{membership:{id:string}}}).data.membership;
  const token=new URL(messages[0].url).searchParams.get('invitation')!;
  setIdentity({subject:`concurrent-${randomUUID()}`,email:invitationEmail,mfa:false});
  const first=await start(app,token);const second=await start(app,token);
  const results=await Promise.all([callback(app,first),callback(app,second)]);
  assert.equal(results.filter((r)=>r.headers.get('Location')==='/').length,1);
  assert.equal(results.filter((r)=>r.headers.get('Location')?.includes('AUTH_NOT_ALLOWED')).length,1);
  const identities=await admin.query('SELECT g.id FROM google_identities g JOIN memberships m ON m.user_id=g.user_id WHERE m.id=$1',[member.id]);assert.equal(identities.rowCount,1);
  const denied=await admin.query("SELECT result FROM auth_audit_events WHERE target_id=(SELECT user_id FROM memberships WHERE id=$1) AND action='login.rejected'",[member.id]);assert.equal(denied.rowCount,1);
});

test('membership branch and role changes revoke access; other-company and retired guard mappings fail',async()=>{
  const {app,fixture}=await setup();const another=await seedTestCompany(admin);
  const viewer=fixture.actors.viewer;
  const path=`/api/memberships/${viewer.principal.membershipId}`;
  assert.equal((await request(app,fixture.actors.admin,path,'PATCH',{expectedVersion:1,branchId:another.branchId,reason:'他社指定'})).status,404);
  assert.equal((await request(app,fixture.actors.admin,path,'PATCH',{expectedVersion:1,branchId:fixture.branchId,reason:'支店異動'})).status,200);
  assert.equal((await request(app,viewer,'/api/me')).status,401);
  await admin.query("UPDATE officers SET status='retired' WHERE id=$1",[fixture.branchOfficerId]);
  assert.equal((await request(app,fixture.actors.admin,'/api/memberships','POST',{displayName:'退職 隊員',invitationEmail:`retired-${randomUUID()}@gmail.com`,branchId:fixture.branchId,role:'guard',officerId:fixture.branchOfficerId})).status,404);
});

test('a session revoked after authentication is rejected again before a business transaction',async()=>{
  const {app,fixture}=await setup();const actor=fixture.actors.admin;
  let signalAuthentication:()=>void=()=>{};let releaseTransaction:()=>void=()=>{};
  const authenticated=new Promise<void>((resolve)=>{signalAuthentication=resolve;});
  const release=new Promise<void>((resolve)=>{releaseTransaction=resolve;});
  const authenticator=createAuthenticator(pool,()=>TEST_NOW);
  app.get('/api/auth-race-test',async(c)=>{
    const principal=await authenticator.authenticate(c);signalAuthentication();await release;
    return c.json(await withTenant(pool,principal,async()=>({executed:true})));
  });
  const pending=request(app,actor,'/api/auth-race-test');await authenticated;
  await admin.query('UPDATE app_sessions SET revoked_at=$2 WHERE user_id=$1',[actor.principal.userId,TEST_NOW]);
  releaseTransaction();assert.equal((await pending).status,401);
});

async function freshTestSession(actor:TestActor):Promise<TestActor>{
  const cookie=randomToken();
  await admin.query(`INSERT INTO app_sessions(id,token_hash,user_id,membership_id,auth_version,created_at,last_activity_at,absolute_expires_at)
    SELECT $1,$2,user_id,id,auth_version,$4,$4,$5 FROM memberships WHERE id=$3`,
  [randomUUID(),tokenHash(cookie),actor.principal.membershipId,TEST_NOW,absoluteSessionExpiry(TEST_NOW)]);
  return {...actor,cookie,csrfToken:csrfToken(cookie)};
}

test('saved branch, quota and invitation operations can be recovered by their original administrator',async()=>{
  const {app,fixture,messages}=await setup();const actor=fixture.actors.admin;
  const branchKey=randomUUID();const branch=await request(app,actor,'/api/branches','POST',{code:'RECOVER_BRANCH',name:'結果確認 支店'},branchKey);
  assert.equal(branch.status,201);const branchData=(await branch.json() as {data:{id:string}}).data;
  const branchResult=await request(app,actor,`/api/operations/${branchKey}`);assert.equal(branchResult.status,200);
  const branchRecovery=await branchResult.json() as {data:{status:string;resultRef:{type:string;id:string};result:{id:string}}};
  assert.equal(branchRecovery.data.status,'succeeded');assert.deepEqual(branchRecovery.data.resultRef,{type:'branch',id:branchData.id});assert.equal(branchRecovery.data.result.id,branchData.id);
  const quotaKey=randomUUID();assert.equal((await request(app,actor,`/api/branches/${fixture.branchId}/officer-limit`,'PATCH',{limit:11,expectedVersion:1,reason:'結果確認増枠'},quotaKey)).status,200);
  const quotaRecovery=await request(app,actor,`/api/operations/${quotaKey}`);assert.equal(quotaRecovery.status,200);
  assert.equal((await quotaRecovery.json() as {data:{result:{officerLimit:number}}}).data.result.officerLimit,11);
  const invitationKey=randomUUID();const invited=await request(app,actor,'/api/memberships','POST',{displayName:'結果確認 利用者',invitationEmail:`operation-${randomUUID()}@gmail.com`,branchId:fixture.headquartersId,role:'viewer'},invitationKey);
  assert.equal(invited.status,201);const invitedData=(await invited.json() as {data:{membership:{id:string}}}).data;
  const invitationRecovery=await request(app,actor,`/api/operations/${invitationKey}`);assert.equal(invitationRecovery.status,200);
  const outcome=await invitationRecovery.json() as {data:{resultRef:{type:string;id:string};result:{delivery:string;membership:{invitationDelivery:string}}}};
  assert.deepEqual(outcome.data.resultRef,{type:'membership',id:invitedData.membership.id});assert.equal(outcome.data.result.delivery,'sent');assert.equal(outcome.data.result.membership.invitationDelivery,'sent');
  assert.equal(messages.length,1);
});

test('auth operation recovery hides other users, other companies and unknown keys',async()=>{
  const {app,fixture}=await setup();const actor=fixture.actors.admin;const key=randomUUID();const another=await seedTestCompany(admin);
  assert.equal((await request(app,actor,'/api/branches','POST',{code:'PRIVATE_OP',name:'非公開 結果'},key)).status,201);
  for(const observer of [fixture.actors.secondAdmin,fixture.actors.dispatcher,fixture.actors.viewer,another.actors.admin]) {
    const response=await request(app,observer,`/api/operations/${key}`);assert.equal(response.status,404);
    assert.equal((await response.json() as {error:string}).error,'NOT_FOUND');
  }
  assert.equal((await request(app,actor,`/api/operations/${randomUUID()}`)).status,404);
});

test('auth recovery rechecks headquarters and role permissions after administrator transfer or demotion',async()=>{
  const {app,fixture}=await setup();const actor=fixture.actors.admin;const branchKey=randomUUID();const memberKey=randomUUID();
  assert.equal((await request(app,actor,'/api/branches','POST',{code:'BEFORE_MOVE',name:'異動前 支店'},branchKey)).status,201);
  assert.equal((await request(app,actor,'/api/memberships','POST',{displayName:'異動前 利用者',invitationEmail:`before-move-${randomUUID()}@gmail.com`,branchId:fixture.headquartersId,role:'viewer'},memberKey)).status,201);
  assert.equal((await request(app,fixture.actors.secondAdmin,`/api/memberships/${actor.principal.membershipId}`,'PATCH',{expectedVersion:1,branchId:fixture.branchId,reason:'支店へ異動'})).status,200);
  assert.equal((await request(app,actor,`/api/operations/${branchKey}`)).status,401);
  const moved=await freshTestSession(actor);
  assert.equal((await request(app,moved,`/api/operations/${branchKey}`)).status,404);
  assert.equal((await request(app,moved,'/api/branches','POST',{code:'BEFORE_MOVE',name:'異動前 支店'},branchKey)).status,404);
  assert.equal((await request(app,moved,`/api/operations/${memberKey}`)).status,200);
  assert.equal((await request(app,fixture.actors.secondAdmin,`/api/memberships/${actor.principal.membershipId}`,'PATCH',{expectedVersion:2,role:'dispatcher',reason:'管制へ権限変更'})).status,200);
  const demoted=await freshTestSession(actor);
  assert.equal((await request(app,demoted,`/api/operations/${memberKey}`)).status,404);
});

test('company administrators can read safe branch and account history without tokens or identity evidence',async()=>{
  const {app,fixture,messages}=await setup();const actor=fixture.actors.admin;const target=fixture.actors.dispatcher;
  assert.equal((await request(app,actor,'/api/branches','POST',{code:'AUDIT_BRANCH',name:'監査確認 支店'})).status,201);
  assert.equal((await request(app,actor,`/api/branches/${fixture.branchId}/officer-limit`,'PATCH',{limit:11,expectedVersion:1,reason:'増枠の業務理由'})).status,200);
  assert.equal((await request(app,actor,`/api/memberships/${target.principal.membershipId}`,'PATCH',{expectedVersion:1,role:'viewer',reason:'役割見直し'})).status,200);
  const identityEvidence='evidence-private-person-verification';
  assert.equal((await request(app,actor,`/api/memberships/${target.principal.membershipId}/google-link-change`,'POST',{expectedVersion:2,invitationEmail:`audit-${randomUUID()}@gmail.com`,reason:'Google連携の承認理由',identityEvidence})).status,200);
  const response=await request(app,actor,'/api/auth/audit-events?page=1&pageSize=100');assert.equal(response.status,200);
  const payload=await response.json() as {data:Array<{actorName:string;targetName:string;action:string;reason:string;createdAt:string;entityType:string}>;page:number;pageSize:number;total:number};
  assert.equal(payload.total,5);assert.equal(payload.data.length,5);
  assert.ok(payload.data.every((row)=>row.actorName==='試験 admin'&&row.createdAt===TEST_NOW.toISOString()));
  assert.ok(payload.data.some((row)=>row.action==='branch.create'&&row.targetName==='監査確認 支店'&&row.entityType==='branch'));
  assert.ok(payload.data.some((row)=>row.action==='membership.change'&&row.reason==='役割見直し'));
  assert.ok(payload.data.some((row)=>row.action==='google.replace.approve'&&row.reason==='Google連携の承認理由'));
  const token=new URL(messages[0].url).searchParams.get('invitation')!;
  const encoded=JSON.stringify(payload);
  for(const forbidden of [identityEvidence,token,tokenHash(token),'tokenHash','token_hash','evidence','email','auth_version']) assert.equal(encoded.includes(forbidden),false);
  const next=await request(app,actor,'/api/auth/audit-events?page=2&pageSize=2');assert.equal(next.status,200);assert.equal((await next.json() as {data:unknown[]}).data.length,2);
  for(const observer of [fixture.actors.viewer,fixture.actors.branchDispatcher,fixture.actors.guard]) assert.equal((await request(app,observer,'/api/auth/audit-events')).status,403);
  const another=await seedTestCompany(admin);
  assert.equal((await request(app,another.actors.admin,'/api/auth/audit-events')).status,200);
  assert.equal((await (await request(app,another.actors.admin,'/api/auth/audit-events')).json() as {total:number}).total,0);
  assert.equal((await request(app,actor,'/api/auth/audit-events?pageSize=101')).status,400);
  assert.equal((await request(app,actor,`/api/auth/audit-events?companyId=${another.companyId}`)).status,400);
});
