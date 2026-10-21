import { describe, expect, it } from 'vitest';
import { appCommit, UNKNOWN_COMMIT } from './app-commit';

const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('appCommit', () => {
  it('returns a full commit sha as built', () => {
    expect(appCommit(SHA)).toBe(SHA);
  });

  it('is unknown when the build did not say', () => {
    expect(appCommit(undefined)).toBe(UNKNOWN_COMMIT);
    expect(appCommit('')).toBe(UNKNOWN_COMMIT);
    expect(appCommit('unknown')).toBe('unknown');
  });

  it('never echoes a value that is not a sha', () => {
    for (const value of [
      SHA.slice(1),
      `${SHA}0`,
      SHA.toUpperCase(),
      `${SHA}\n`,
      `x${SHA.slice(1)}`,
      'main',
    ]) {
      expect(appCommit(value)).toBe(UNKNOWN_COMMIT);
    }
  });
});
