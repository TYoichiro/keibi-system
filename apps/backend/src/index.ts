import { serve } from '@hono/node-server';
import app from './app.js';

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const server = serve(
  {
    fetch: app.fetch,
    hostname: process.env.HOST ?? '0.0.0.0',
    port,
  },
  (info) => {
    console.log(`API server listening on port ${info.port}`);
  },
);

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
