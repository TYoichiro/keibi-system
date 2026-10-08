import { randomUUID } from 'node:crypto';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import type { Pool } from 'pg';
import { createAuthRouter, type AuthOptions } from './auth/router.js';
import { AuthError } from './auth/types.js';
import { createDomainRouter } from './domain/router.js';

type Options = {
  checkDatabase: () => Promise<unknown>;
  allowedOrigins: string[];
  production?: boolean;
  maxBodyBytes?: number;
  rateLimitPoints?: number;
  rateLimitDuration?: number;
  clientAddress?: (context: Context) => string;
  log?: (entry: Record<string, unknown>) => void;
  pool?: Pool;
  auth?: Omit<AuthOptions, 'pool' | 'allowedOrigins' | 'production'>;
};

export function createApp(options: Options) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));
  const limiter = new RateLimiterMemory({
    points: options.rateLimitPoints ?? 120,
    duration: options.rateLimitDuration ?? 60,
  });

  app.use(async (c, next) => {
    const requestId = randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    c.header('Cache-Control', 'no-store');
    const started = Date.now();
    await next();
    const path = c.req.path.startsWith('/api/auth/invitations/') ? '/api/auth/invitations/:token' : c.req.path;
    log({ requestId, method: c.req.method, path, status: c.res.status, durationMs: Date.now() - started });
  });

  app.use(secureHeaders({
    xFrameOptions: 'DENY',
    strictTransportSecurity: options.production ? 'max-age=31536000' : false,
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  }));

  app.use('/api/*', async (c, next) => {
    // Use the socket address. Forwarded headers are untrusted without a configured trusted proxy.
    const address = options.clientAddress?.(c) ?? getConnInfo(c).remote.address ?? 'unknown';
    try {
      await limiter.consume(address);
    } catch (error) {
      if (!(error instanceof RateLimiterRes)) throw error;
      c.header('Retry-After', String(Math.max(1, Math.ceil(error.msBeforeNext / 1000))));
      return c.json({ error: 'TOO_MANY_REQUESTS' }, 429);
    }
    await next();
  });

  app.use('/api/*', bodyLimit({
    maxSize: options.maxBodyBytes ?? 1024 * 1024,
    onError: (c) => c.json({ error: 'PAYLOAD_TOO_LARGE' }, 413),
  }));

  app.use('/api/*', async (c, next) => {
    // OAuth's fixed GET callback is protected by browser-bound one-time state, nonce and PKCE.
    if (c.req.method === 'GET' && c.req.path === '/api/auth/google/callback') return next();
    const origin = c.req.header('Origin');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method);
    if (c.req.header('Sec-Fetch-Site') === 'cross-site' ||
      (origin !== undefined && !options.allowedOrigins.includes(origin)) ||
      (unsafe && !origin)) {
      return c.json({ error: 'FORBIDDEN_ORIGIN' }, 403);
    }
    await next();
  });
  app.use('/api/*', csrf({ origin: options.allowedOrigins, secFetchSite: () => false }));

  app.get('/api/health', async (c) => {
    try {
      await options.checkDatabase();
      return c.json({ status: 'ok', database: 'ok' });
    } catch {
      log({ requestId: c.get('requestId'), event: 'database_unavailable' });
      return c.json({ status: 'error', database: 'error' }, 503);
    }
  });

  if (options.pool) {
    const auth = createAuthRouter({ pool: options.pool, allowedOrigins: options.allowedOrigins,
      appOrigin: options.auth?.appOrigin ?? options.allowedOrigins[0], production: options.production, ...options.auth });
    app.route('/', auth.router);
    app.route('/', createDomainRouter({ pool: options.pool, authenticate: auth.authenticate, now: options.auth?.now }));
  }

  app.notFound((c) => c.json({ message: 'Not Found' }, 404));
  app.onError((error, c) => {
    if (error instanceof AuthError) {
      return c.json({ error: error.code, requestId: c.get('requestId'), fieldIssues: [], retryable: false }, error.status);
    }
    if ('code' in error && ['23505','23503','23514'].includes(String(error.code))) {
      return c.json({ error: 'STATE_CONFLICT', requestId: c.get('requestId'), fieldIssues: [], retryable: false }, 409);
    }
    if (error instanceof HTTPException && error.status < 500) {
      return c.json({ error: 'REQUEST_REJECTED', requestId: c.get('requestId') }, error.status);
    }
    log({ requestId: c.get('requestId'), event: 'request_failed', errorType: error.name });
    return c.json({ error: 'INTERNAL_SERVER_ERROR', requestId: c.get('requestId') }, 500);
  });
  return app;
}
