import { serve } from '@hono/node-server';
import { Server } from 'node:http';
import { createApp } from './app.js';
import { parseConfig } from './config.js';
import { createPool } from './db.js';
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGoogleProvider } from './auth/google.js';
import { createInvitationMailer } from './auth/mail.js';

const config = parseConfig(process.env);
const pool = createPool(config);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const secret = (path: string) => {
  let value: string;
  try { value = readFileSync(isAbsolute(path) ? path : resolve(root, path), 'utf8').trim(); }
  catch { throw new Error('Required authentication or mail secret file is unavailable.'); }
  if (!value) throw new Error('Required authentication or mail secret file is empty.');
  return value;
};
const app = createApp({
  checkDatabase: () => pool.query('SELECT 1'),
  allowedOrigins: config.ALLOWED_ORIGINS,
  production: config.NODE_ENV === 'production',
  maxBodyBytes: config.MAX_BODY_BYTES,
  rateLimitPoints: config.RATE_LIMIT_POINTS,
  rateLimitDuration: config.RATE_LIMIT_DURATION,
  pool,
  auth: {
    appOrigin: config.APP_ORIGIN,
    google: config.GOOGLE_CLIENT_ID ? createGoogleProvider({ clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: secret(config.GOOGLE_CLIENT_SECRET_FILE), redirectUri: config.GOOGLE_REDIRECT_URI }) : undefined,
    mailer: config.SMTP_HOST ? createInvitationMailer({ host: config.SMTP_HOST, port: config.SMTP_PORT,
      secure: config.SMTP_SECURE, from: config.SMTP_FROM, user: config.SMTP_USER || undefined,
      password: config.SMTP_USER ? secret(config.SMTP_PASSWORD_FILE) : undefined }) : undefined,
  },
});

const server = serve(
  {
    fetch: app.fetch,
    hostname: config.HOST,
    port: config.PORT,
  },
  (info) => {
    console.log(`API server listening on port ${info.port}`);
  },
);

if (server instanceof Server) {
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 100;
}

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  const timeout = setTimeout(() => {
    console.error('Server shutdown timed out');
    process.exit(1);
  }, 8000);
  timeout.unref();

  server.close(async (error) => {
    try {
      await pool.end();
      if (error) throw error;
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
