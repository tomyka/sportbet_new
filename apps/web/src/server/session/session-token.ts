import { createHash, randomBytes } from 'node:crypto';

/** A new session token: 32 random bytes, base64url. Only the cookie holds it. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database holds of a token: its SHA-256, hex. A token is random, so no slow hash is needed. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
