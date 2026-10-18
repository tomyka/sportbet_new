import { describe, expect, it } from 'vitest';
import { challengeOf, newNonce, newState, newVerifier } from './pkce';

const URL_SAFE = /^[A-Za-z0-9_-]+$/;

describe('challengeOf (RFC 7636)', () => {
  it("gives the S256 challenge of the specification's appendix B", () => {
    expect(challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('is unpadded base64url, 43 characters', () => {
    expect(challengeOf(newVerifier())).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('the random values', () => {
  it('a verifier is 43 to 128 URL-safe characters (64 here)', () => {
    const verifier = newVerifier();
    expect(verifier).toMatch(URL_SAFE);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toHaveLength(64);
  });

  it('state and nonce are 32 bytes, 43 URL-safe characters', () => {
    expect(newState()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newNonce()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('two calls differ, for each', () => {
    for (const make of [newVerifier, newState, newNonce]) {
      expect(make()).not.toBe(make());
    }
  });
});
