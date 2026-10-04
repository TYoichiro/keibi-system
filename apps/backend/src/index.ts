import { serve } from '@hono/node-server';
import { Server } from 'node:http';
import { createApp } from './app.js';
import { parseConfig } from './config.js';
import { createPool } from './db.js';

const config = parseConfig(process.env);
const pool = createPool(config);
const app = createApp({
  checkDatabase: () => pool.query('SELECT 1'),
  allowedOrigins: config.ALLOWED_ORIGINS,
  production: config.NODE_ENV === 'production',
  maxBodyBytes: config.MAX_BODY_BYTES,
  rateLimitPoints: config.RATE_LIMIT_POINTS,
  rateLimitDuration: config.RATE_LIMIT_DURATION,
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
