import { Hono } from 'hono';
import { logger } from 'hono/logger';

const app = new Hono();

app.use(logger());

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.notFound((c) => c.json({ message: 'Not Found' }, 404));

export default app;
