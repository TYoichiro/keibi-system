import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';

// Preserve spaces and Unicode. Do not trim passwords or silently truncate them.
export const passwordSchema = z.string().min(15).max(128);

export async function hashPassword(password: string) {
  if (!passwordSchema.safeParse(password).success) throw new Error('Invalid password length');
  return hash(password, {
    algorithm: 2, // Argon2id; the package declares Algorithm as an ambient const enum.
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
}

export async function verifyPassword(encodedHash: string, password: string) {
  if (!passwordSchema.safeParse(password).success) return false;
  try {
    return await verify(encodedHash, password);
  } catch {
    return false;
  }
}
