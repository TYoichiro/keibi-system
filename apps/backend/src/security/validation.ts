import { zValidator } from '@hono/zod-validator';
import type { z } from 'zod';

export function validateJson<T extends z.ZodType>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return c.json({ error: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
    }
    if (!result.success) {
      return c.json({
        error: 'INVALID_INPUT',
        fields: result.error.issues.map((issue) => issue.path.join('.')),
      }, 400);
    }
  });
}
