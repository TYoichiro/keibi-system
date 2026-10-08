import { Hono, type Context } from 'hono';
import type { Pool, PoolClient } from 'pg';
import type { z } from 'zod';
import { AuthError, type Principal } from '../auth/types.js';
import { withTenant } from '../auth/tenant.js';
import { DomainError, mutation, parse, role, sqlError, type MutationResult } from './core.js';
import { registerMasters } from './masters.js';
import { registerDuties } from './duties.js';

type Work = (db: PoolClient, principal: Principal, context: Context, now: Date) => Promise<unknown>;
export type Registration = {
  read: (path: string, allowed: Principal['role'][], work: Work) => void;
  write: <T>(method: 'post' | 'patch' | 'put', path: string, allowed: Principal['role'][], schema: z.ZodType<T>,
    work: (db: PoolClient, principal: Principal, context: Context, now: Date, body: T) => Promise<MutationResult>) => void;
};
export type DomainOptions = { pool: Pool; authenticate: (c: Context) => Promise<Principal>; now?: () => Date };
export function createDomainRouter(options: DomainOptions) {
  const app = new Hono();
  const now = options.now ?? (() => new Date());
  app.onError((error, c) => {
    const issue = error instanceof DomainError || error instanceof AuthError ? error : sqlError(error);
    if (!issue) return c.json({ error: 'INTERNAL_SERVER_ERROR', requestId: c.res.headers.get('X-Request-Id') }, 500);
    return c.json({ error: issue.code, requestId: c.res.headers.get('X-Request-Id'), fieldIssues: issue instanceof DomainError ? issue.fieldIssues : [], retryable: false }, issue.status);
  });
  const registration: Registration = {
    read(path, allowed, work) {
      app.get(path, async (c) => {
        const p = await options.authenticate(c); role(p, allowed);
        return c.json(await withTenant(options.pool, p, (db) => work(db, p, c, now())));
      });
    },
    write(method, path, allowed, schema, work) {
      app[method](path, async (c) => {
        const p = await options.authenticate(c); role(p, allowed);
        if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return c.json({ error: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
        let raw: unknown;
        try { raw = await c.req.json(); } catch { return c.json({ error: 'VALIDATION_ERROR', fieldIssues: [{ path: '', code: 'INVALID_JSON' }] }, 400); }
        const body = parse(schema, raw);
        const result = await withTenant(options.pool, p, (db) => mutation(db, p, c, body, now(), () => work(db, p, c, now(), body)));
        return c.json({ data: result.data }, result.status);
      });
    },
  };
  registerMasters(registration);
  registerDuties(registration);
  return app;
}
