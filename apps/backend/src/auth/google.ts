import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AuthError } from './types.js';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 5000 });
export const randomToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const csrfToken = (session: string) => tokenHash(`keibi-csrf:${session}`);
export const GOOGLE_ISSUER = 'https://accounts.google.com';

export type GoogleIdentity = { subject: string; email: string; mfa: boolean };
export type GoogleProvider = {
  authorizationUrl: (transaction: { state: string; nonce: string; verifier: string }) => string;
  exchange: (code: string, verifier: string, nonce: string, now: Date) => Promise<GoogleIdentity>;
};

export async function verifyGoogleToken(token: string, options: {
  audience: string; nonce: string; now: Date; keys?: JWTVerifyGetKey;
}): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(token, options.keys ?? googleKeys, {
    algorithms: ['RS256'], issuer: [GOOGLE_ISSUER, 'accounts.google.com'], audience: options.audience,
    requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce', 'email', 'email_verified'],
    currentDate: options.now, clockTolerance: 5,
  });
  if (payload.nonce !== options.nonce || typeof payload.sub !== 'string' || !payload.sub ||
    typeof payload.iat !== 'number' || payload.iat > options.now.getTime() / 1000 + 5 ||
    (payload.azp !== undefined && payload.azp !== options.audience) ||
    (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== options.audience) ||
    payload.email_verified !== true || typeof payload.email !== 'string' || payload.email.length > 320) {
    throw new AuthError('AUTH_NOT_ALLOWED', 403);
  }
  const email = payload.email.trim().toLowerCase();
  const domain = email.slice(email.lastIndexOf('@') + 1);
  const workspace = typeof payload.hd === 'string' && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(payload.hd) && payload.hd.includes('.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (!['gmail.com', 'googlemail.com'].includes(domain) && !workspace)) {
    throw new AuthError('AUTH_NOT_ALLOWED', 403);
  }
  return { subject: payload.sub, email, mfa: Array.isArray(payload.amr) && payload.amr.includes('mfa') };
}

export function createGoogleProvider(config: { clientId: string; clientSecret: string; redirectUri: string }): GoogleProvider {
  return {
    authorizationUrl: ({ state, nonce, verifier }) => {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'openid email',
        state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
        prompt: 'select_account', claims: JSON.stringify({ id_token: { amr: { essential: true }, auth_time: { essential: true } } }),
      }).toString();
      return url.toString();
    },
    exchange: async (code, verifier, nonce, now) => {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, code_verifier: verifier, client_id: config.clientId, client_secret: config.clientSecret,
          redirect_uri: config.redirectUri, grant_type: 'authorization_code' }),
      });
      if (!response.ok) throw new AuthError('AUTH_UNAVAILABLE', 503);
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('id_token' in result) || typeof result.id_token !== 'string') {
        throw new AuthError('AUTH_UNAVAILABLE', 503);
      }
      return verifyGoogleToken(result.id_token, { audience: config.clientId, nonce, now });
    },
  };
}

/** Calendar month in Japan, clamped to the last day of the following month. */
export function absoluteSessionExpiry(created: Date): Date {
  const japan = new Date(created.getTime() + 9 * 60 * 60 * 1000);
  const year = japan.getUTCFullYear();
  const month = japan.getUTCMonth() + 1;
  const day = Math.min(japan.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day, japan.getUTCHours(), japan.getUTCMinutes(), japan.getUTCSeconds(), japan.getUTCMilliseconds()) - 9 * 60 * 60 * 1000);
}
