import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { z } from 'zod';
import { parseConfig } from '../config.js';
import { randomToken, tokenHash } from './google.js';
import { createInvitationMailer, type InvitationMailer } from './mail.js';

const text = z.string().trim().min(1).max(2000);
const common = { operator: text, reason: text, identityEvidence: text, companyEvidence: text, invitationEmail: z.email().max(320) };
export const operatorSchema = z.discriminatedUnion('command', [
  z.strictObject({ command: z.literal('bootstrap'), ...common, companyCode: z.string().regex(/^[A-Z0-9_-]{1,32}$/), companyName: text, displayName: text }),
  z.strictObject({ command: z.literal('recover'), ...common, companyId: z.uuid(), membershipId: z.uuid(),
    mode: z.enum(['sole-admin-account-replacement', 'all-admins-unavailable']), confirmedUnavailable: z.literal('true') }),
]);
export type OperatorInput = z.infer<typeof operatorSchema>;

/** This procedure is reachable only from the administrator CLI, never through an HTTP route. */
export async function runOperator(pool: pg.Pool, input: OperatorInput, options: { appOrigin: string; mailer: InvitationMailer; now?: Date }) {
  const data = operatorSchema.parse(input);
  const client = await pool.connect();
  const now = options.now ?? new Date(); const expiresAt = new Date(now.getTime() + 168 * 3600000);
  const token = randomToken(); const invitationId = randomUUID();
  let companyId: string; let userId: string; let membershipId: string; let companyName: string; let displayName: string;
  try {
    await client.query('BEGIN');
    if (data.command === 'bootstrap') {
      companyId = randomUUID(); userId = randomUUID(); membershipId = randomUUID(); const branchId = randomUUID();
      companyName = data.companyName; displayName = data.displayName;
      await client.query('INSERT INTO companies(id,code,name) VALUES($1,$2,$3)', [companyId, data.companyCode, companyName]);
      await client.query("INSERT INTO branches(id,company_id,code,name,kind) VALUES($1,$2,'HQ','本店','headquarters')", [branchId, companyId]);
      await client.query('INSERT INTO app_users(id,display_name) VALUES($1,$2)', [userId, displayName]);
      await client.query("INSERT INTO memberships(id,user_id,company_id,branch_id,role,invitation_email) VALUES($1,$2,$3,$4,'company_admin',$5)", [membershipId, userId, companyId, branchId, data.invitationEmail.toLowerCase()]);
    } else {
      companyId = data.companyId; membershipId = data.membershipId;
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))', [companyId]);
      const target = await client.query(`SELECT m.*,c.name company_name,u.display_name FROM memberships m JOIN companies c ON c.id=m.company_id
        JOIN app_users u ON u.id=m.user_id WHERE m.id=$1 AND m.company_id=$2 FOR UPDATE OF m`, [membershipId, companyId]);
      if (!target.rowCount) throw new Error('Operator target unavailable');
      const member = target.rows[0]; userId = member.user_id; companyName = member.company_name; displayName = member.display_name;
      if (data.mode === 'sole-admin-account-replacement') {
        if (member.role !== 'company_admin') throw new Error('Target must be a company administrator');
        const others = await client.query("SELECT id FROM memberships WHERE company_id=$1 AND id<>$2 AND role='company_admin' AND status='active'", [companyId, membershipId]);
        if (others.rowCount) throw new Error('A different company administrator must approve the replacement');
      } else {
        // Operator evidence is required because active DB status cannot show Google account recoverability.
        await client.query(`UPDATE app_sessions SET revoked_at=$2 WHERE revoked_at IS NULL AND membership_id IN
          (SELECT id FROM memberships WHERE company_id=$1 AND role='company_admin')`, [companyId, now]);
        await client.query("UPDATE memberships SET status='suspended',auth_version=auth_version+1,version=version+1 WHERE company_id=$1 AND role='company_admin' AND id<>$2", [companyId, membershipId]);
      }
      await client.query('UPDATE google_identities SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL', [userId, now]);
      await client.query('UPDATE app_sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL', [userId, now]);
      await client.query("UPDATE memberships SET role='company_admin',officer_id=NULL,status='invited',invitation_email=$2,auth_version=auth_version+1,version=version+1 WHERE id=$1", [membershipId, data.invitationEmail.toLowerCase()]);
      await client.query("UPDATE app_users SET status='invited' WHERE id=$1", [userId]);
      await client.query('UPDATE auth_invitations SET revoked_at=$2 WHERE membership_id=$1 AND revoked_at IS NULL AND consumed_at IS NULL', [membershipId, now]);
    }
    await client.query(`INSERT INTO auth_invitations(id,company_id,membership_id,token_hash,issued_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6)`, [invitationId, companyId, membershipId, tokenHash(token), now, expiresAt]);
    await client.query(`INSERT INTO auth_audit_events(id,company_id,target_id,action,reason,evidence,created_at,result)
      VALUES($1,$2,$3,$4,$5,$6,$7,'success')`, [randomUUID(), companyId, userId, `operator.${data.command}`, data.reason,
      JSON.stringify({ operator: data.operator, companyEvidence: data.companyEvidence, identityEvidence: data.identityEvidence,
        ...(data.command === 'recover' ? { mode: data.mode, confirmedUnavailable: data.confirmedUnavailable } : {}) }), now]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
  try {
    await options.mailer.send({ to: data.invitationEmail.toLowerCase(), displayName, companyName,
      url: `${options.appOrigin}/account/activate?invitation=${encodeURIComponent(token)}`, expiresAt });
    await pool.query("UPDATE auth_invitations SET delivery_status='sent' WHERE id=$1", [invitationId]);
    return { companyId, membershipId, delivery: 'sent', expiresAt: expiresAt.toISOString() };
  } catch {
    await pool.query("UPDATE auth_invitations SET delivery_status='failed' WHERE id=$1", [invitationId]);
    return { companyId, membershipId, delivery: 'failed', expiresAt: expiresAt.toISOString() };
  }
}

async function main() {
  const config = parseConfig(process.env);
  if (!config.SMTP_HOST) throw new Error('SMTP configuration is required for operator invitations');
  const args: Record<string, string> = { command: process.argv[2] ?? '' };
  for (let index = 3; index < process.argv.length; index += 2) {
    const flag = process.argv[index]; const value = process.argv[index + 1];
    if (!flag?.startsWith('--') || !value) throw new Error('Invalid operator arguments');
    args[flag.slice(2).replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = value;
  }
  const parsed = operatorSchema.safeParse(args);
  if (!parsed.success) throw new Error(`Invalid operator fields: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const readSecret = (path: string) => {
    const secret = readFileSync(isAbsolute(path) ? path : resolve(root, path), 'utf8').trim();
    if (!secret) throw new Error('Required operator secret unavailable');
    return secret;
  };
  const password = readSecret(config.POSTGRES_ADMIN_PASSWORD_FILE);
  if (password.length < 32) throw new Error('Administrator secret too short');
  const pool = new pg.Pool({ host: config.POSTGRES_HOST, port: config.POSTGRES_PORT, database: config.POSTGRES_DB,
    user: config.POSTGRES_USER, password, max: 1 });
  try {
    const mailer = createInvitationMailer({ host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE,
      from: config.SMTP_FROM, user: config.SMTP_USER || undefined, password: config.SMTP_USER ? readSecret(config.SMTP_PASSWORD_FILE) : undefined });
    console.log(JSON.stringify(await runOperator(pool, parsed.data, { appOrigin: config.APP_ORIGIN, mailer })));
  } finally { await pool.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('運営者処理に失敗しました。設定・対象・承認条件を確認してください。'); process.exitCode = 1; });
}
