import pg from 'pg';

function pool(variable: 'TEST_DATABASE_URL' | 'TEST_APP_DATABASE_URL') {
  const connectionString = process.env[variable];
  if (!connectionString) throw new Error('Run tests with npm run test from the repository root; an isolated database is required.');
  return new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000 });
}

/** New pools per test suite; close them in after(). No production database fallback. */
export const adminPool = () => pool('TEST_DATABASE_URL');
export const applicationPool = () => pool('TEST_APP_DATABASE_URL');
