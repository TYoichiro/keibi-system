import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Pool, PoolClient } from 'pg';
import { csrfToken, tokenHash } from './google.js';
import { AuthError, type Principal } from './types.js';

export const SESSION_COOKIE = 'keibi_session';
export const OAUTH_COOKIE = 'keibi_oauth';
export type SessionInfo = Principal & { displayName: string; email: string; companyName: string; branchName: string };
const verifiedSessions = new WeakMap<Principal, { hash: string; now: () => Date }>();

export async function recheckSession(client: PoolClient, principal: Principal) {
  const binding = verifiedSessions.get(principal);
  // Direct Principal injection is used only by trusted internal callers and isolated tests.
  if (!binding) return;
  const current = await client.query('SELECT keibi_session($1,$2) AS data', [binding.hash, binding.now()]);
  if (!current.rows[0]?.data) throw new AuthError('SESSION_REQUIRED', 401);
}

export function createAuthenticator(pool: Pool, now: () => Date = () => new Date()) {
  const session = async (c: Context): Promise<SessionInfo> => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError('SESSION_REQUIRED', 401);
    const result = await pool.query<{ data: SessionInfo | null }>('SELECT keibi_session($1,$2) AS data', [tokenHash(token), now()]);
    const principal = result.rows[0]?.data;
    if (!principal) throw new AuthError('SESSION_REQUIRED', 401);
    verifiedSessions.set(principal, { hash: tokenHash(token), now });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const actual = c.req.header('X-CSRF-Token') ?? '';
      const expected = csrfToken(token);
      if (!/^[0-9a-f]{64}$/.test(actual) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
        throw new AuthError('CSRF_INVALID', 403);
      }
    }
    return principal;
  };
  return { session, authenticate: (c: Context): Promise<Principal> => session(c) };
}
