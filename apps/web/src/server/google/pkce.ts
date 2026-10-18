import { createHash, randomBytes } from 'node:crypto';

/** RFC 7636: a verifier of 43 to 128 characters of the URL-safe alphabet. 48 random bytes are 64 of them. */
export function newVerifier(): string {
  return randomBytes(48).toString('base64url');
}

/** RFC 7636's `S256`: the base64url of the verifier's SHA-256, unpadded. */
export function challengeOf(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** `state`: 32 random bytes, which tie the callback to the browser that started it. */
export function newState(): string {
  return randomBytes(32).toString('base64url');
}

/** `nonce`: 32 random bytes, which tie the id_token to this trip. */
export function newNonce(): string {
  return randomBytes(32).toString('base64url');
}
