import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from './database.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const containerName = `keibi-tests-${randomUUID()}`;
const adminSecret = randomBytes(48).toString('base64url');
const appSecret = randomBytes(48).toString('base64url');
let started = false;

async function runNode(arguments_, environment) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, arguments_, { cwd: root, env: environment, stdio: 'inherit', windowsHide: true });
    child.once('error', () => resolve(1));
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

try {
  execFileSync('docker', ['run', '--detach', '--rm', '--name', containerName,
    '--env', `POSTGRES_PASSWORD=${adminSecret}`, '--env', 'POSTGRES_DB=keibi_test',
    '--publish', '127.0.0.1::5432', 'postgres:18-alpine'], { stdio: 'pipe', windowsHide: true });
  started = true;
  const mapped = execFileSync('docker', ['port', containerName, '5432/tcp'], { encoding: 'utf8', windowsHide: true }).trim();
  const port = Number(mapped.split(':').at(-1));
  const adminUrl = `postgresql://postgres:${adminSecret}@127.0.0.1:${port}/keibi_test`;
  const appUrl = `postgresql://keibi_app:${appSecret}@127.0.0.1:${port}/keibi_test`;
  const admin = new pg.Pool({ connectionString: adminUrl, max: 2, connectionTimeoutMillis: 1000 });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await admin.query('SELECT 1'); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
    }
    if (!ready) throw new Error('Test database did not become ready.');
    // Secret is random test-only data. Parameterization avoids quoting it into SQL.
    await admin.query('CREATE ROLE keibi_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
    await admin.query("SELECT format('ALTER ROLE keibi_app PASSWORD %L', $1::text) AS command", [appSecret])
      .then((result) => admin.query(result.rows[0].command));
    await migrate(admin);
  } finally {
    await admin.end();
  }
  const environment = { ...process.env, NODE_ENV: 'test', TEST_DATABASE_URL: adminUrl, TEST_APP_DATABASE_URL: appUrl };
  if (process.argv.includes('--e2e')) {
    process.exitCode = await runNode(['--import', 'tsx', 'tests/e2e/run.ts'], environment);
  } else {
    const files = (await readdir(new URL('apps/backend/test/', new URL('../', import.meta.url))))
      .filter((name) => name.endsWith('.test.ts')).sort().map((name) => `apps/backend/test/${name}`);
    process.exitCode = await runNode(['--import', 'tsx', '--test', '--test-concurrency=1', ...files], environment);
  }
} catch (error) {
  console.error(`Test environment failed (${error.code ?? error.name}). Docker Desktop must be running.`);
  process.exitCode = 1;
} finally {
  if (started) {
    try { execFileSync('docker', ['stop', '--time', '2', containerName], { stdio: 'pipe', windowsHide: true }); }
    catch { console.error('The temporary test container could not be stopped.'); process.exitCode = 1; }
  }
}
