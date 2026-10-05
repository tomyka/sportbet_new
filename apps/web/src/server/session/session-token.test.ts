import { describe, expect, it } from 'vitest';
import { hashSessionToken, newSessionToken } from './session-token';

describe('the session token', () => {
  it('is 32 random bytes, stored only as its SHA-256', () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(token);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });
});
