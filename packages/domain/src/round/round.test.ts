import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { rate, roundNo } from '../testing';
import { Round } from './round';
import { STAGE_RATES, type Stage } from './stage';

const round = (stage: Stage, rateValue: number, survival = false) => ({
  number: roundNo(39),
  stage,
  rate: rate(rateValue),
  survival,
  knockout: false,
});

describe('LR-4', () => {
  it('rate: the post-season rates are play-in 1, play-offs 2, Final Four 3, final 3', () => {
    expect(STAGE_RATES).toEqual({
      regular: 1,
      'play-in': 1,
      'play-offs': 2,
      'final-four': 3,
      final: 3,
    });
    for (const [stage, value] of [
      ['play-in', 1],
      ['play-offs', 2],
      ['final-four', 3],
      ['final', 3],
    ] as const) {
      expect(Round.create(round(stage, value)).ok).toBe(true);
    }
    expect(Round.create(round('play-offs', 1))).toEqual(
      refuse('rate-does-not-match-stage'),
    );
  });
});

describe('SU-7', () => {
  it('survival: no pick after round 38', () => {
    // Round 39 is the first play-off round: it cannot carry survival (R-10).
    expect(Round.create(round('play-offs', 2, true))).toEqual(
      refuse('survival-outside-regular-season'),
    );
    expect(Round.create(round('play-offs', 2, false)).ok).toBe(true);
  });
});

describe('Round.stored: a stored round read back', () => {
  it('round: keeps a play-off round flagged for survival at any rate, whatever the set', () => {
    // sportbet let an admin set both; the ruled set would refuse either on
    // entry, but a stored row is read back as it was stored.
    expect(Round.create(round('play-offs', 5, true))).toEqual(
      refuse('rate-does-not-match-stage'),
    );
    expect(Round.create(round('play-offs', 2, true))).toEqual(
      refuse('survival-outside-regular-season'),
    );
    const stored = Round.stored(round('play-offs', 5, true));
    expect(stored.survival).toBe(true);
    expect(stored.rate.value).toBe(5);
    expect(stored.stage).toBe('play-offs');
  });
});
