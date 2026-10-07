import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import { recalculateAllLimits, resultSaveLimits } from './result-throttle';

// R-69 (slice 7 security review): sportbet sets no limit on results saves
// or on the recalculation.

describe('resultSaveLimits (R-69)', () => {
  it('throttle: 30 accepted results saves a minute per results manager', () => {
    expect(resultSaveLimits(player('7'))).toEqual([
      { key: 'result-save:player:7', maxAttempts: 30, windowSeconds: 60 },
    ]);
  });
});

describe('recalculateAllLimits (R-69)', () => {
  it('throttle: "Perskaičiuoti taškus" twice a minute per account', () => {
    expect(recalculateAllLimits(player('7'))).toEqual([
      { key: 'recalculate-all:player:7', maxAttempts: 2, windowSeconds: 60 },
    ]);
  });

  it('throttle: each account has its own windows', () => {
    expect(resultSaveLimits(player('7'))[0]?.key).not.toBe(
      resultSaveLimits(player('8'))[0]?.key,
    );
    expect(recalculateAllLimits(player('7'))[0]?.key).not.toBe(
      recalculateAllLimits(player('8'))[0]?.key,
    );
  });
});
