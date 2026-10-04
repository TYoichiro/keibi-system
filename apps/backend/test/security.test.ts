import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { parseConfig } from '../src/config.js';
import { hashPassword, verifyPassword } from '../src/security/password.js';
import { validateJson } from '../src/security/validation.js';

const trustedOrigin = 'http://localhost:5173';
const baseOptions = {
  allowedOrigins: [trustedOrigin],
  checkDatabase: async () => undefined,
  clientAddress: () => '127.0.0.1',
  log: () => undefined,
};

test('security headers and a server-generated request ID cover successes and errors', async () => {
  const app = createApp(baseOptions);
  for (const path of ['/api/health', '/api/missing']) {
    const response = await app.request(path, { headers: { 'X-Request-Id': 'client-controlled' } });
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(response.headers.get('Content-Security-Policy') ?? '', /default-src 'none'/);
    assert.match(response.headers.get('X-Request-Id') ?? '', /^[0-9a-f-]{36}$/);
    assert.equal(response.headers.get('Strict-Transport-Security'), null);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
});

test('HTTPS production mode sends HSTS', async () => {
  const app = createApp({ ...baseOptions, production: true });
  const response = await app.request('/api/health');
  assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
});

test('cross-site requests and untrusted or missing mutation origins are rejected', async () => {
  const app = createApp(baseOptions);
  app.post('/api/example', (c) => c.json({ ok: true }));
  for (const contentType of ['application/json', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
    const response = await app.request('/api/example', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example', 'Sec-Fetch-Site': 'same-origin', 'Content-Type': contentType },
      body: '{}',
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  }
  assert.equal((await app.request('/api/example', { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await app.request('/api/health', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await app.request('/api/example', { method: 'POST', headers: { Origin: trustedOrigin }, body: '{}' })).status, 200);
  assert.equal((await app.request('/api/health')).status, 200);
});

test('oversized bodies are rejected, including streamed bodies without Content-Length', async () => {
  const app = createApp({ ...baseOptions, maxBodyBytes: 16 });
  app.post('/api/example', (c) => c.json({ ok: true }));
  const headers = { Origin: trustedOrigin, 'Content-Type': 'application/json' };
  const response = await app.request('/api/example', { method: 'POST', headers, body: 'a'.repeat(17) });
  assert.equal(response.status, 413);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(17));
      controller.close();
    },
  });
  const request = new Request('http://localhost/api/example', {
    method: 'POST', headers, body: stream, duplex: 'half',
  });
  assert.equal((await app.request(request)).status, 413);
});

test('rate limiting cannot be bypassed with spoofed forwarded headers', async () => {
  const app = createApp({ ...baseOptions, rateLimitPoints: 2 });
  for (const ip of ['192.0.2.1', '192.0.2.2']) {
    assert.equal((await app.request('/api/health', { headers: { 'X-Forwarded-For': ip } })).status, 200);
  }
  const response = await app.request('/api/health', { headers: { 'X-Forwarded-For': '192.0.2.3' } });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('Retry-After')) >= 1);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('JSON validation rejects unknown fields, invalid JSON, wrong content types, and invalid values', async () => {
  const app = createApp(baseOptions);
  app.post('/api/example', validateJson(z.strictObject({ count: z.number().int().positive() })), (c) => {
    return c.json(c.req.valid('json'));
  });
  for (const [body, expected] of [['{"count":1}', 200], ['{"count":-1}', 400], ['{"count":1,"admin":true}', 400], ['{', 400]] as const) {
    const response = await app.request('/api/example', {
      method: 'POST', headers: { Origin: trustedOrigin, 'Content-Type': 'application/json' }, body,
    });
    assert.equal(response.status, expected);
  }
  const wrongType = await app.request('/api/example', {
    method: 'POST', headers: { Origin: trustedOrigin, 'Content-Type': 'text/plain' }, body: '{"count":1}',
  });
  assert.equal(wrongType.status, 415);
});

test('internal failures and query parameters are not exposed in responses or logs', async () => {
  const entries: Record<string, unknown>[] = [];
  const app = createApp({ ...baseOptions, log: (entry) => entries.push(entry) });
  app.get('/api/failure', () => { throw new Error('private-database-password'); });
  const response = await app.request('/api/failure?token=private-access-token');
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.match(body, /INTERNAL_SERVER_ERROR/);
  assert.doesNotMatch(body + JSON.stringify(entries), /private-database-password|private-access-token/);
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
});

test('database outages return a sanitized 503', async () => {
  const app = createApp({ ...baseOptions, checkDatabase: async () => { throw new Error('private-host-name'); } });
  const response = await app.request('/api/health');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'error', database: 'error' });
});

test('invalid configuration fails closed without printing values', () => {
  assert.throws(() => parseConfig({ PORT: 'private-secret' }), (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /PORT/);
    assert.doesNotMatch(error.message, /private-secret/);
    return true;
  });
  assert.throws(() => parseConfig({ POSTGRES_APP_USER: 'keibi' }));
  assert.throws(() => parseConfig({ RATE_LIMIT_POINTS: '0' }));
  assert.throws(() => parseConfig({ NODE_ENV: 'production' }));
  for (const origin of ['*', 'http://localhost:5173/extra', 'https://user:password@example.com', 'null']) {
    assert.throws(() => parseConfig({ ALLOWED_ORIGINS: origin }));
  }
  assert.deepEqual(parseConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://example.com' }).ALLOWED_ORIGINS, ['https://example.com']);
});

test('Argon2id uses unique salts and verifies passwords without truncation', async () => {
  const password = '  Long Unicode passphrase 日本語  ';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, password), true);
  assert.equal(await verifyPassword(first, password.trim()), false);
  assert.equal(await verifyPassword('invalid-hash', password), false);
  await assert.rejects(hashPassword('short'));
  await assert.rejects(hashPassword('a'.repeat(129)));
});
