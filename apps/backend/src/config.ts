import { z } from 'zod';

const origin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash;
  } catch {
    return false;
  }
}, 'Must be an HTTP(S) origin without a path').transform((value) => new URL(value).origin);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  POSTGRES_HOST: z.string().min(1).default('127.0.0.1'),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  POSTGRES_DB: z.string().min(1).default('keibi'),
  POSTGRES_USER: z.string().min(1).default('keibi'),
  POSTGRES_APP_USER: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/).default('keibi_app'),
  POSTGRES_APP_PASSWORD_FILE: z.string().min(1).default('.secrets/postgres_app_password'),
  ALLOWED_ORIGINS: z.string().min(1)
    .default('http://localhost:5173,http://127.0.0.1:5173')
    .transform((value) => value.split(',').map((part) => part.trim()))
    .pipe(z.array(origin).min(1)),
  MAX_BODY_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(1024 * 1024),
  RATE_LIMIT_POINTS: z.coerce.number().int().min(1).max(10000).default(120),
  RATE_LIMIT_DURATION: z.coerce.number().int().min(1).max(3600).default(60),
}).superRefine((value, context) => {
  if (value.POSTGRES_USER === value.POSTGRES_APP_USER) {
    context.addIssue({ code: 'custom', path: ['POSTGRES_APP_USER'], message: 'Must differ from the administrator' });
  }
  if (value.NODE_ENV === 'production' && value.ALLOWED_ORIGINS.some((url) => !url.startsWith('https://'))) {
    context.addIssue({ code: 'custom', path: ['ALLOWED_ORIGINS'], message: 'Production origins must use HTTPS' });
  }
});

export type Config = z.infer<typeof schema>;

export function parseConfig(environment: NodeJS.ProcessEnv): Config {
  const result = schema.safeParse(environment);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${names.join(', ')}`);
  }
  return result.data;
}
