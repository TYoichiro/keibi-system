import { randomUUID } from 'node:crypto';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

type Options = {
  checkDatabase: () => Promise<unknown>;
  allowedOrigins: string[];
  production?: boolean;
  maxBodyBytes?: number;
  rateLimitPoints?: number;
  rateLimitDuration?: number;
  clientAddress?: (context: Context) => string;
  log?: (entry: Record<string, unknown>) => void;
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
    log({ requestId, method: c.req.method, path: c.req.path, status: c.res.status, durationMs: Date.now() - started });
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

  app.notFound((c) => c.json({ message: 'Not Found' }, 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status < 500) {
      return c.json({ error: 'REQUEST_REJECTED', requestId: c.get('requestId') }, error.status);
    }
    log({ requestId: c.get('requestId'), event: 'request_failed', errorType: error.name });
    return c.json({ error: 'INTERNAL_SERVER_ERROR', requestId: c.get('requestId') }, 500);
  });
  return app;
}
