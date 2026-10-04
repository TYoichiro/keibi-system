import pg from 'pg';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';

export function createPool(config: Config) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const secretPath = isAbsolute(config.POSTGRES_APP_PASSWORD_FILE)
    ? config.POSTGRES_APP_PASSWORD_FILE
    : resolve(root, config.POSTGRES_APP_PASSWORD_FILE);
  let password: string;
  try {
    password = readFileSync(secretPath, 'utf8').trim();
  } catch {
    throw new Error('Database secret is unavailable. Run npm run setup before starting the application.');
  }
  if (password.length < 32) {
    throw new Error('Database secret must contain at least 32 characters.');
  }

  const pool = new pg.Pool({
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    database: config.POSTGRES_DB,
    user: config.POSTGRES_APP_USER,
    password,
    max: 10,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    statement_timeout: 2000,
    application_name: 'keibi-api',
  });

  pool.on('error', () => {
    console.error('Unexpected database connection error');
  });
  return pool;
}
