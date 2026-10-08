import type { Context } from 'hono';
import type { Pool } from 'pg';

export type Role = 'company_admin' | 'dispatcher' | 'viewer' | 'guard';
export type Principal = {
  userId: string;
  membershipId: string;
  companyId: string;
  branchId: string;
  role: Role;
  officerId: string | null;
};

export type Authentication = {
  pool: Pool;
  authenticate: (context: Context) => Promise<Principal>;
  now?: () => Date;
};

export class AuthError extends Error {
  constructor(public readonly code: string, public readonly status: 400 | 401 | 403 | 404 | 409 | 503) {
    super(code);
    this.name = 'AuthError';
  }
}
