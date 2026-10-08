import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { validateJson } from '../security/validation.js';
import { absoluteSessionExpiry, csrfToken, randomToken, tokenHash, type GoogleProvider } from './google.js';
import type { InvitationMailer, InvitationMessage } from './mail.js';
import { createAuthenticator, OAUTH_COOKIE, SESSION_COOKIE } from './service.js';
import { withTenant } from './tenant.js';
import { AuthError, type Principal } from './types.js';
import { authOperation } from './operations.js';

export type AuthOptions = { pool: Pool; allowedOrigins: string[]; appOrigin: string; production?: boolean;
  google?: GoogleProvider; mailer?: InvitationMailer; now?: () => Date };
const role = z.enum(['company_admin', 'dispatcher', 'viewer', 'guard']);
const name = z.string().trim().min(1).max(100);
const code = z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/).transform((s) => s.toUpperCase());
const reason = z.string().trim().min(1).max(500);
const email = z.email().max(320).transform((s) => s.toLowerCase());
const uuid = z.uuid();
const version = z.number().int().positive();
const memberSchema = z.strictObject({ displayName: name, invitationEmail: email, branchId: uuid, role, officerId: uuid.nullable().optional() })
  .refine((i) => i.role === 'guard' ? Boolean(i.officerId) : !i.officerId, { path: ['officerId'], message: 'Officer mapping required only for guards' });
const changeSchema = z.strictObject({ expectedVersion: version, reason, role: role.optional(), branchId: uuid.optional(),
  officerId: uuid.nullable().optional(), status: z.enum(['active', 'suspended']).optional() });
type MemberRow = { id: string; user_id: string; company_id: string; branch_id: string; role: Principal['role']; officer_id: string | null;
  invitation_email: string; status: string; version: number; auth_version: number };

function parseId(c: Context): string {
  const result = uuid.safeParse(c.req.param('id'));
  if (!result.success) throw new AuthError('NOT_FOUND', 404);
  return result.data;
}
function memberDto(row: Record<string, unknown>) {
  return { id: row.id, userId: row.user_id, displayName: row.display_name, invitationEmail: row.invitation_email,
    googleEmail: row.google_email ?? null, branchId: row.branch_id, branchName: row.branch_name,
    role: row.role, officerId: row.officer_id, status: row.status, version: row.version,
    invitationDelivery: row.invitation_delivery ?? null };
}
function branchDto(row: Record<string, unknown>) {
  return { id: row.id, code: row.code, name: row.name, kind: row.kind, status: row.status, officerLimit: row.officer_limit, version: row.version,
    ...(row.officer_count === undefined ? {} : { officerCount: row.officer_count }) };
}

export function createAuthRouter(options: AuthOptions) {
  const app = new Hono();
  const now = options.now ?? (() => new Date());
  const auth = createAuthenticator(options.pool, now);
  const cookieOptions = { httpOnly: true, secure: options.production ?? false, sameSite: 'Lax' as const, path: '/api' };
  const audit = async (db: PoolClient, p: Principal, action: string, target: string, detail: string | null = null, evidence: string | null = null) => {
    await db.query(`INSERT INTO auth_audit_events(id,company_id,actor_id,target_id,action,reason,evidence,created_at,result)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'success')`, [randomUUID(), p.companyId, p.userId, target, action, detail, evidence, now()]);
  };
  const membership = async (db: PoolClient, id: string) => {
    const result = await db.query(`SELECT m.*,u.display_name,b.name branch_name,keibi_google_email(m.user_id) google_email,
      (SELECT i.delivery_status FROM auth_invitations i WHERE i.membership_id=m.id ORDER BY (i.revoked_at IS NULL AND i.consumed_at IS NULL) DESC,i.issued_at DESC,i.id DESC LIMIT 1) invitation_delivery
      FROM memberships m JOIN app_users u ON u.id=m.user_id JOIN branches b ON b.id=m.branch_id WHERE m.id=$1`, [id]);
    if (!result.rowCount) throw new AuthError('NOT_FOUND', 404);
    return memberDto(result.rows[0]);
  };
  const issue = async (db: PoolClient, p: Principal, member: MemberRow, detail: string | null = null): Promise<InvitationMessage> => {
    const token = randomToken();
    const issued = now();
    const expiresAt = new Date(issued.getTime() + 168 * 60 * 60 * 1000);
    await db.query('UPDATE auth_invitations SET revoked_at=$2 WHERE membership_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL', [member.id, issued]);
    await db.query(`INSERT INTO auth_invitations(id,company_id,membership_id,token_hash,issued_at,expires_at,issued_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), p.companyId, member.id, tokenHash(token), issued, expiresAt, p.userId]);
    const details = await db.query('SELECT u.display_name,c.name FROM app_users u JOIN companies c ON c.id=$2 WHERE u.id=$1', [member.user_id, p.companyId]);
    await audit(db, p, 'invitation.issue', member.user_id, detail);
    return { to: member.invitation_email, displayName: details.rows[0].display_name, companyName: details.rows[0].name,
      url: `${options.appOrigin}/account/activate?invitation=${encodeURIComponent(token)}`, expiresAt };
  };
  const deliver = async (p: Principal, message: InvitationMessage) => {
    let delivery: 'sent' | 'pending' | 'failed' = 'pending';
    if (options.mailer) {
      try { await options.mailer.send(message); delivery = 'sent'; } catch { delivery = 'failed'; }
    }
    await withTenant(options.pool, p, async (db) => {
      const invitation = new URL(message.url).searchParams.get('invitation');
      await db.query('UPDATE auth_invitations SET delivery_status=$2 WHERE token_hash=$1', [tokenHash(invitation!), delivery]);
    });
    return delivery;
  };
  const mutation = async (c: Context, input: unknown, success: 200 | 201,
    work: (db: PoolClient, p: Principal) => Promise<{ data: unknown; message?: InvitationMessage }>) => {
    const p = await auth.authenticate(c);
    if (p.role !== 'company_admin') throw new AuthError('OPERATION_FORBIDDEN', 403);
    const key = z.uuid().safeParse(c.req.header('Idempotency-Key'));
    if (!key.success) throw new AuthError('IDEMPOTENCY_KEY_REQUIRED', 400);
    const fingerprint = tokenHash(JSON.stringify({ method: c.req.method, path: c.req.path, input }));
    const result = await withTenant(options.pool, p, async (db) => {
      const previous = await db.query('SELECT fingerprint,response,status_code FROM auth_idempotency_keys WHERE company_id=$1 AND user_id=$2 AND key=$3', [p.companyId, p.userId, key.data]);
      if (previous.rowCount) {
        if (previous.rows[0].fingerprint !== fingerprint) throw new AuthError('IDEMPOTENCY_CONFLICT', 409);
        const recovered = await authOperation(db, p, key.data);
        if (!recovered) throw new AuthError('NOT_FOUND', 404);
        return { data: recovered.result, message: undefined, replay: true, status: previous.rows[0].status_code as 200 | 201 };
      }
      const outcome = await work(db, p);
      const branchOperation = c.req.path.startsWith('/api/branches');
      const data = outcome.data as { id?: string; membership?: { id: string } };
      const entityId = data.membership?.id ?? data.id;
      await db.query(`INSERT INTO auth_idempotency_keys(company_id,user_id,key,fingerprint,status_code,response,created_at,entity_type,entity_id,headquarters_required)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [p.companyId, p.userId, key.data, fingerprint, success, JSON.stringify(outcome.data), now(),
        branchOperation ? 'branch' : 'membership', entityId, branchOperation]);
      return { ...outcome, replay: false, status: success };
    });
    if (result.message) {
      const delivery = await deliver(p, result.message);
      const body = { ...(result.data as Record<string, unknown>), delivery };
      if ('membership' in body && body.membership && typeof body.membership === 'object') Object.assign(body.membership, { invitationDelivery: delivery });
      return c.json({ data: body }, result.status);
    }
    if (result.replay) c.header('Idempotency-Replayed', 'true');
    return c.json({ data: result.data }, result.status);
  };
  const target = async (db: PoolClient, id: string, expected: number): Promise<MemberRow> => {
    const result = await db.query<MemberRow>('SELECT * FROM memberships WHERE id=$1 FOR UPDATE', [id]);
    if (!result.rowCount) throw new AuthError('NOT_FOUND', 404);
    if (result.rows[0].version !== expected) throw new AuthError('VERSION_CONFLICT', 409);
    return result.rows[0];
  };
  const validateBranchOfficer = async (db: PoolClient, branchId: string, memberRole: string, officerId: string | null) => {
    if ((memberRole === 'guard') !== Boolean(officerId)) throw new AuthError('VALIDATION_ERROR', 400);
    const branch = await db.query("SELECT id FROM branches WHERE id=$1 AND status='active'", [branchId]);
    if (!branch.rowCount) throw new AuthError('NOT_FOUND', 404);
    if (officerId) {
      const officer = await db.query("SELECT id FROM officers WHERE id=$1 AND branch_id=$2 AND status<>'retired'", [officerId, branchId]);
      if (!officer.rowCount) throw new AuthError('NOT_FOUND', 404);
    }
  };

  app.get('/api/me', async (c) => c.json({ data: { ...await auth.session(c), csrfToken: csrfToken(getCookie(c, SESSION_COOKIE)!), serverTime: now().toISOString() } }));
  app.get('/api/auth/google/start', async (c) => {
    const origin = c.req.header('Origin');
    const referer = c.req.header('Referer');
    let referred = false;
    try { referred = Boolean(referer && options.allowedOrigins.includes(new URL(referer).origin)); } catch { /* invalid referer */ }
    if ((!origin || !options.allowedOrigins.includes(origin)) && !referred) throw new AuthError('FORBIDDEN_ORIGIN', 403);
    if (!options.google) return c.redirect('/login?error=AUTH_NOT_CONFIGURED');
    const invitation = c.req.query('invitation');
    if (invitation && !/^[A-Za-z0-9_-]{43}$/.test(invitation)) return c.redirect('/login?error=INVITATION_INVALID');
    if (invitation) {
      const inspect = await options.pool.query('SELECT keibi_invitation_inspect($1,$2) AS data', [tokenHash(invitation), now()]);
      if (!inspect.rows[0]?.data) return c.redirect('/login?error=INVITATION_INVALID');
    }
    const requested = c.req.query('returnTo') ?? '/';
    const returnTo = ['/', '/guard', '/account/security'].includes(requested) ? requested : '/';
    const state = randomToken(); const nonce = randomToken(); const verifier = randomToken(); const browser = randomToken();
    await options.pool.query('SELECT keibi_oauth_start($1,$2,$3,$4,$5,$6,$7)',
      [tokenHash(state), tokenHash(browser), nonce, verifier, invitation ? tokenHash(invitation) : null, returnTo, now()]);
    setCookie(c, OAUTH_COOKIE, browser, { ...cookieOptions, path: '/api/auth/google', maxAge: 600 });
    c.header('Referrer-Policy', 'no-referrer');
    return c.redirect(options.google.authorizationUrl({ state, nonce, verifier }));
  });
  app.get('/api/auth/google/callback', async (c) => {
    c.header('Referrer-Policy', 'no-referrer');
    const state = c.req.query('state'); const browser = getCookie(c, OAUTH_COOKIE);
    const reject = async (code: string) => {
      await options.pool.query('SELECT keibi_auth_rejection($1,$2,$3)', [state ? tokenHash(state) : null, code, now()]);
      return c.redirect(`/login?error=${code}`);
    };
    deleteCookie(c, OAUTH_COOKIE, { ...cookieOptions, path: '/api/auth/google' });
    if (!state || !browser || !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(browser)) return reject('AUTH_TRANSACTION_INVALID');
    const transaction = await options.pool.query('SELECT * FROM keibi_oauth_consume($1,$2,$3)', [tokenHash(state), tokenHash(browser), now()]);
    if (!transaction.rowCount || !options.google) return reject('AUTH_TRANSACTION_INVALID');
    const code = c.req.query('code');
    if (!code || code.length > 4096 || c.req.query('error')) return reject('AUTH_CANCELLED');
    try {
      const identity = await options.google.exchange(code, transaction.rows[0].verifier, transaction.rows[0].nonce, now());
      const session = randomToken(); const created = now();
      const result = await options.pool.query('SELECT keibi_login($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS data', [identity.subject, identity.email,
        transaction.rows[0].invitation_hash, identity.mfa, randomUUID(), tokenHash(session), randomUUID(), randomUUID(), created, absoluteSessionExpiry(created)]);
      const data = result.rows[0]?.data;
      if (!data || data.error) return reject(data?.error === 'AUTH_POLICY_REQUIRED' ? 'AUTH_POLICY_REQUIRED' : 'AUTH_NOT_ALLOWED');
      const old = getCookie(c, SESSION_COOKIE);
      if (old) await options.pool.query('SELECT keibi_session_logout($1,false,$2)', [tokenHash(old), created]);
      setCookie(c, SESSION_COOKIE, session, { ...cookieOptions, expires: absoluteSessionExpiry(created) });
      const path = transaction.rows[0].return_to;
      return c.redirect(data.role === 'guard' && path === '/' ? '/guard' : path);
    } catch (error) {
      return reject(error instanceof AuthError && error.code === 'AUTH_POLICY_REQUIRED' ? 'AUTH_POLICY_REQUIRED' : 'AUTH_UNAVAILABLE');
    }
  });
  app.get('/api/auth/invitations/:token', async (c) => {
    const token = c.req.param('token');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError('NOT_FOUND', 404);
    const result = await options.pool.query('SELECT keibi_invitation_inspect($1,$2) AS data', [tokenHash(token), now()]);
    if (!result.rows[0]?.data) throw new AuthError('NOT_FOUND', 404);
    c.header('Referrer-Policy', 'no-referrer');
    return c.json({ data: result.rows[0].data });
  });
  app.post('/api/auth/activity', validateJson(z.strictObject({})), async (c) => {
    await auth.authenticate(c);
    await options.pool.query('SELECT keibi_session_activity($1,$2)', [tokenHash(getCookie(c, SESSION_COOKIE)!), now()]);
    return c.json({ data: { recorded: true } });
  });
  for (const all of [false, true]) app.post(`/api/auth/${all ? 'logout-all' : 'logout'}`, validateJson(z.strictObject({})), async (c) => {
    await auth.authenticate(c);
    await options.pool.query('SELECT keibi_session_logout($1,$2,$3)', [tokenHash(getCookie(c, SESSION_COOKIE)!), all, now()]);
    deleteCookie(c, SESSION_COOKIE, cookieOptions);
    return c.json({ data: { loggedOut: true } });
  });
  app.get('/api/branches', async (c) => {
    const p = await auth.authenticate(c);
    return c.json({ data: await withTenant(options.pool, p, async (db) => {
      const result = await db.query(`SELECT b.*,(SELECT count(*)::int FROM officers o WHERE o.company_id=b.company_id AND o.branch_id=b.id AND o.status<>'retired') officer_count
        FROM branches b WHERE ($1 OR b.id=$2) ORDER BY b.kind DESC,b.code,b.id`, [p.role === 'company_admin', p.branchId]);
      return result.rows.map((row) => p.role === 'company_admin' ? branchDto(row) : { id: row.id, code: row.code, name: row.name, kind: row.kind, status: row.status });
    }) });
  });
  const headquarters = async (db: PoolClient, p: Principal) => {
    const result = await db.query("SELECT id FROM branches WHERE id=$1 AND kind='headquarters' AND status='active'", [p.branchId]);
    if (!result.rowCount) throw new AuthError('OPERATION_FORBIDDEN', 403);
  };
  app.post('/api/branches', validateJson(z.strictObject({ code, name })), async (c) => {
    const input = c.req.valid('json');
    return mutation(c, input, 201, async (db, p) => {
      await headquarters(db, p);
      const id = randomUUID();
      const result = await db.query(`INSERT INTO branches(id,company_id,code,name,kind) VALUES($1,$2,$3,$4,'branch') RETURNING *`, [id, p.companyId, input.code, input.name]);
      await audit(db, p, 'branch.create', id);
      return { data: branchDto(result.rows[0]) };
    });
  });
  app.patch('/api/branches/:id/officer-limit', validateJson(z.strictObject({ limit: z.number().int().min(10).max(10000), expectedVersion: version, reason })), async (c) => {
    const input = c.req.valid('json'); const id = parseId(c);
    return mutation(c, input, 200, async (db, p) => {
      await headquarters(db, p);
      const result = await db.query('SELECT * FROM branches WHERE id=$1 FOR UPDATE', [id]);
      if (!result.rowCount) throw new AuthError('NOT_FOUND', 404);
      if (result.rows[0].version !== input.expectedVersion) throw new AuthError('VERSION_CONFLICT', 409);
      if (input.limit <= result.rows[0].officer_limit) throw new AuthError('STATE_CONFLICT', 409);
      const updated = await db.query('UPDATE branches SET officer_limit=$2,version=version+1 WHERE id=$1 RETURNING *', [id, input.limit]);
      await audit(db, p, 'branch.quota', id, input.reason);
      return { data: branchDto(updated.rows[0]) };
    });
  });
  app.get('/api/memberships', async (c) => {
    const p = await auth.authenticate(c);
    if (p.role !== 'company_admin') throw new AuthError('OPERATION_FORBIDDEN', 403);
    return c.json({ data: await withTenant(options.pool, p, async (db) => {
      const result = await db.query(`SELECT m.*,u.display_name,b.name branch_name,keibi_google_email(m.user_id) google_email,
        (SELECT i.delivery_status FROM auth_invitations i WHERE i.membership_id=m.id ORDER BY (i.revoked_at IS NULL AND i.consumed_at IS NULL) DESC,i.issued_at DESC,i.id DESC LIMIT 1) invitation_delivery
        FROM memberships m JOIN app_users u ON u.id=m.user_id JOIN branches b ON b.id=m.branch_id ORDER BY u.display_name,m.id`);
      return result.rows.map(memberDto);
    }) });
  });
  app.get('/api/auth/audit-events', async (c) => {
    const p = await auth.authenticate(c);
    if (p.role !== 'company_admin') throw new AuthError('OPERATION_FORBIDDEN', 403);
    const parsed = z.strictObject({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(c.req.query());
    if (!parsed.success) throw new AuthError('VALIDATION_ERROR', 400);
    const { page, pageSize } = parsed.data;
    return c.json(await withTenant(options.pool, p, async (db) => {
      const scope = "a.company_id=$1 AND (a.action LIKE 'branch.%' OR a.action LIKE 'membership.%' OR a.action LIKE 'invitation.%' OR a.action LIKE 'google.%' OR a.action LIKE 'operator.%')";
      const total = await db.query(`SELECT count(*)::int count FROM auth_audit_events a WHERE ${scope}`, [p.companyId]);
      const rows = await db.query(`SELECT a.id,a.actor_id,coalesce(actor.display_name,'運営者') actor_name,a.target_id,
        CASE WHEN a.action LIKE 'branch.%' THEN 'branch' ELSE 'account' END entity_type,
        coalesce(b.name,target.display_name,'') target_name,a.action,a.reason,a.created_at,a.result
        FROM auth_audit_events a LEFT JOIN app_users actor ON actor.id=a.actor_id
        LEFT JOIN app_users target ON target.id=a.target_id LEFT JOIN branches b ON b.id=a.target_id AND b.company_id=a.company_id
        WHERE ${scope} ORDER BY a.created_at DESC,a.id LIMIT $2 OFFSET $3`, [p.companyId, pageSize, (page-1)*pageSize]);
      return { data: rows.rows.map((row) => ({ id: row.id, actorId: row.actor_id, actorName: row.actor_name,
        entityType: row.entity_type, entityId: row.target_id, targetName: row.target_name, action: row.action,
        reason: row.reason ?? '', createdAt: row.created_at.toISOString(), result: row.result })), page, pageSize, total: total.rows[0].count };
    }));
  });
  app.post('/api/memberships', validateJson(memberSchema), async (c) => {
    const input = c.req.valid('json');
    return mutation(c, input, 201, async (db, p) => {
      await validateBranchOfficer(db, input.branchId, input.role, input.officerId ?? null);
      const userId = randomUUID(); const id = randomUUID();
      await db.query('INSERT INTO app_users(id,display_name) VALUES($1,$2)', [userId, input.displayName]);
      const result = await db.query<MemberRow>('INSERT INTO memberships(id,user_id,company_id,branch_id,role,officer_id,invitation_email) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [id, userId, p.companyId, input.branchId, input.role, input.officerId ?? null, input.invitationEmail]);
      const message = await issue(db, p, result.rows[0]);
      return { data: { membership: await membership(db, id), delivery: 'pending' }, message };
    });
  });
  app.patch('/api/memberships/:id', validateJson(changeSchema), async (c) => {
    const input = c.req.valid('json'); const id = parseId(c);
    return mutation(c, input, 200, async (db, p) => {
      const member = await target(db, id, input.expectedVersion);
      const nextRole = input.role ?? member.role; const nextStatus = input.status ?? member.status;
      if (member.role === 'company_admin' && member.status === 'active' && (nextRole !== 'company_admin' || nextStatus !== 'active')) {
        const remaining = await db.query("SELECT id FROM memberships WHERE role='company_admin' AND status='active' AND id<>$1", [id]);
        if (!remaining.rowCount) throw new AuthError('LAST_ADMIN_REQUIRED', 409);
      }
      if (member.status !== 'active' && nextStatus === 'active') {
        const linked = await db.query('SELECT keibi_google_email($1) AS email', [member.user_id]);
        if (!linked.rows[0]?.email) throw new AuthError('STATE_CONFLICT', 409);
      }
      const branchId = input.branchId ?? member.branch_id;
      const officerId = input.officerId === undefined ? (nextRole === 'guard' ? member.officer_id : null) : input.officerId;
      await validateBranchOfficer(db, branchId, nextRole, officerId);
      await db.query('UPDATE memberships SET role=$2,status=$3,branch_id=$4,officer_id=$5,auth_version=auth_version+1,version=version+1 WHERE id=$1', [id, nextRole, nextStatus, branchId, officerId]);
      await db.query('UPDATE app_users SET status=$2 WHERE id=$1', [member.user_id, nextStatus]);
      await db.query('SELECT keibi_revoke_user_sessions($1,$2)', [member.user_id, now()]);
      await audit(db, p, 'membership.change', member.user_id, input.reason);
      return { data: await membership(db, id) };
    });
  });
  app.post('/api/memberships/:id/invitations', validateJson(z.strictObject({ expectedVersion: version, reason })), async (c) => {
    const input = c.req.valid('json'); const id = parseId(c);
    return mutation(c, input, 200, async (db, p) => {
      const member = await target(db, id, input.expectedVersion);
      if (member.status !== 'invited') throw new AuthError('STATE_CONFLICT', 409);
      await db.query('UPDATE memberships SET version=version+1 WHERE id=$1', [id]);
      const message = await issue(db, p, member, input.reason);
      return { data: { membership: await membership(db, id), delivery: 'pending' }, message };
    });
  });
  app.post('/api/memberships/:id/google-link-change', validateJson(z.strictObject({ expectedVersion: version, invitationEmail: email, reason, identityEvidence: z.string().trim().min(1).max(2000) })), async (c) => {
    const input = c.req.valid('json'); const id = parseId(c);
    return mutation(c, input, 200, async (db, p) => {
      const member = await target(db, id, input.expectedVersion);
      // An administrator cannot approve their own Google account replacement.
      if (member.role === 'company_admin' && member.user_id === p.userId) throw new AuthError('SEPARATE_APPROVAL_REQUIRED', 403);
      await db.query('SELECT keibi_revoke_google($1,$2)', [member.user_id, now()]);
      await db.query("UPDATE memberships SET invitation_email=$2,status='invited',auth_version=auth_version+1,version=version+1 WHERE id=$1", [id, input.invitationEmail]);
      await db.query("UPDATE app_users SET status='invited' WHERE id=$1", [member.user_id]);
      await audit(db, p, 'google.replace.approve', member.user_id, input.reason, input.identityEvidence);
      const message = await issue(db, p, { ...member, invitation_email: input.invitationEmail }, input.reason);
      return { data: { membership: await membership(db, id), delivery: 'pending' }, message };
    });
  });
  return { router: app, authenticate: auth.authenticate };
}
