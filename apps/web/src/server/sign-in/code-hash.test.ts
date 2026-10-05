import { describe, expect, it } from 'vitest';
import {
  DUMMY_CODE_HASH,
  generateLoginCode,
  hashLoginCode,
  loginCodeMatches,
  SCRYPT_COST,
} from './code-hash';

describe('a login code', () => {
  it('is eight digits from a cryptographic source', () => {
    const codes = Array.from({ length: 50 }, generateLoginCode);
    for (const code of codes) expect(code).toMatch(/^\d{8}$/);
    expect(new Set(codes).size).toBeGreaterThan(1);
  });

  it('is stored as a salted scrypt hash that matches it and nothing else', async () => {
    const hash = await hashLoginCode('01234567');
    expect(hash).toMatch(
      /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
    );
    expect(hash).not.toContain('01234567');
    expect(await hashLoginCode('01234567')).not.toBe(hash);
    expect(await loginCodeMatches('01234567', hash)).toBe(true);
    expect(await loginCodeMatches('01234568', hash)).toBe(false);
  });
});

// sportbet's #36 item 2 and #37 item 1: with no live code, verify still
// pays a full hash, at the same cost as a real one.
describe('DUMMY_CODE_HASH', () => {
  it('is a real scrypt hash at the cost real codes are hashed at', async () => {
    expect(DUMMY_CODE_HASH.split('$').slice(1, 4)).toEqual([
      String(SCRYPT_COST.N),
      String(SCRYPT_COST.r),
      String(SCRYPT_COST.p),
    ]);
    expect(await loginCodeMatches('no-live-code', DUMMY_CODE_HASH)).toBe(true);
  });

  it('matches no eight-digit code', async () => {
    expect(await loginCodeMatches('00000000', DUMMY_CODE_HASH)).toBe(false);
  });
});

it('throws on a stored hash that is not one: an impossible state', async () => {
  await expect(loginCodeMatches('01234567', 'plain')).rejects.toThrow(
    /not a scrypt hash/,
  );
});
