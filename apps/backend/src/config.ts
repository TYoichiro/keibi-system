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
  POSTGRES_ADMIN_PASSWORD_FILE: z.string().min(1).default('.secrets/postgres_admin_password'),
  APP_ORIGIN: origin.default('http://localhost:5173'),
  GOOGLE_CLIENT_ID: z.string().trim().max(500).default(''),
  GOOGLE_CLIENT_SECRET_FILE: z.string().min(1).default('.secrets/google_client_secret'),
  GOOGLE_REDIRECT_URI: z.url().default('http://localhost:5173/api/auth/google/callback'),
  SMTP_HOST: z.string().trim().max(253).default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true','false']).default('false').transform((s) => s==='true'),
  SMTP_USER: z.string().max(320).default(''),
  SMTP_PASSWORD_FILE: z.string().min(1).default('.secrets/smtp_password'),
  SMTP_FROM: z.union([z.email(),z.literal('')]).default(''),
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
  if (value.GOOGLE_CLIENT_ID) {
    const callback = new URL(value.GOOGLE_REDIRECT_URI);
    if (callback.origin !== value.APP_ORIGIN || callback.pathname !== '/api/auth/google/callback' || callback.search || callback.hash || callback.username || callback.password) {
      context.addIssue({ code: 'custom', path: ['GOOGLE_REDIRECT_URI'], message: 'Must match the application callback' });
    }
  }
  if (value.SMTP_HOST && !value.SMTP_FROM) context.addIssue({ code: 'custom', path: ['SMTP_FROM'], message: 'Required for SMTP' });
  if (value.NODE_ENV === 'production' && value.GOOGLE_CLIENT_ID && !value.APP_ORIGIN.startsWith('https://')) {
    context.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'Production application origin must use HTTPS' });
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
