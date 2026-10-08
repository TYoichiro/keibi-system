import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer as socketServer } from 'node:net';
import { serve } from '@hono/node-server';
import { createServer } from 'vite';
import { createApp } from '../../apps/backend/src/app.js';
import { adminPool, applicationPool } from '../../apps/backend/test/database.js';
import { seedTestCompany, TEST_NOW } from '../../apps/backend/test/fixtures.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const admin = adminPool();
const pool = applicationPool();
const fixtureFile = fileURLToPath(new URL(`../../.cache/e2e-${randomUUID()}.json`, import.meta.url));
const uiPort = await new Promise<number>((resolve, reject) => {
  const socket = socketServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const address = socket.address();
    if (!address || typeof address === 'string') return reject(new Error('No test port available.'));
    socket.close(() => resolve(address.port));
  });
});
const baseURL = `http://127.0.0.1:${uiPort}`;
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
let backend: ReturnType<typeof serve> | undefined;
try {
  const app = createApp({ pool, auth: {appOrigin: baseURL, now: () => TEST_NOW}, checkDatabase: () => pool.query('SELECT 1'), allowedOrigins: [baseURL], rateLimitPoints: 10000, clientAddress: () => '127.0.0.1', log: () => undefined });
  backend = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => { if (backend?.listening) resolve(); else backend?.once('listening', resolve); });
  const address = backend.address();
  if (!address || typeof address === 'string') throw new Error('Browser test backend did not become ready.');
  vite = await createServer({ configFile: fileURLToPath(new URL('../../apps/frontend/vite.config.ts', import.meta.url)), root: fileURLToPath(new URL('../../apps/frontend', import.meta.url)), server: {host: '127.0.0.1', port: uiPort, strictPort: true, proxy: {'/api': {target: `http://127.0.0.1:${address.port}`, changeOrigin: true}}} });
  await vite.listen();
  const a = await seedTestCompany(admin, 'E2EA');
  const b = await seedTestCompany(admin, 'E2EB');
  const request = async (path: string, data: object) => {
    const response = await app.request(`/api${path}`, {method: 'POST', headers: {Origin: baseURL, 'Content-Type': 'application/json', Cookie: `keibi_session=${a.actors.admin.cookie}`, 'X-CSRF-Token': a.actors.admin.csrfToken, 'Idempotency-Key': randomUUID()}, body: JSON.stringify(data)});
    if (!response.ok) {
      const failure = await response.json();
      throw new Error(`Browser fixture API setup failed (${response.status}, ${path}, ${failure.error}, ${JSON.stringify(failure.fieldIssues ?? [])}).`);
    }
    return (await response.json()).data;
  };
  const draft = await request('/duty-slots', {siteId: a.siteId, dutyDate: '2026-10-04', startsAt: '2026-10-04T08:00:00+09:00', endsAt: '2026-10-04T17:00:00+09:00', requiredCount: 1, assignments: [{officerId: a.officerId, isLeader: true}], availabilityCheck: {confirmed: true}, travelRestCheck: {confirmed: true}, qualificationRequirements: []});
  const published = await request(`/duty-slots/${draft.id}/confirm`, {expectedVersion: draft.version, draftVersionId: draft.draftVersionId, reason: 'ブラウザ試験用の配置確定'});
  await mkdir(new URL('../../.cache/', import.meta.url), {recursive: true});
  await writeFile(fixtureFile, JSON.stringify({a, b, publishedSlotId: published.id}), {mode: 0o600});
  console.log('Browser tests: isolated fixtures ready; Google identities are synthetic test data.');
  process.exitCode = await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'tests/e2e/playwright.config.ts'], {cwd: root, env: {...process.env, E2E_BASE_URL: baseURL, E2E_FIXTURE_FILE: fixtureFile}, stdio: 'inherit', windowsHide: true});
    child.once('error', () => resolve(1));
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  await vite?.close();
  if (backend) await new Promise<void>((resolve) => backend?.close(() => resolve()));
  await pool.end();
  await admin.end();
  await rm(fixtureFile, {force: true});
}
