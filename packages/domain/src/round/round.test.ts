import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { refuse } from '../shared/result';
import { rate, roundNo } from '../testing';
import { Round } from './round';
import type { Stage } from './stage';

const round = (stage: Stage, rateValue: number, survival = false) => ({
  number: roundNo(39),
  stage,
  rate: rate(rateValue),
  survival,
  knockout: false,
});

describe('LR-4', () => {
  it('rate (ruled): the post-season rates are play-in 1, play-offs 2, Final Four 3, final 3', () => {
    expect(ruledRules.stageRates).toEqual({
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
      expect(Round.create(round(stage, value), ruledRules).ok).toBe(true);
    }
    expect(Round.create(round('play-offs', 1), ruledRules)).toEqual(
      refuse('rate-does-not-match-stage'),
    );
  });

  it('rate (sportbet): a round carries whatever rate the admin set', () => {
    expect(sportbetRules.stageRates).toBeNull();
    expect(Round.create(round('play-offs', 1), sportbetRules).ok).toBe(true);
    expect(Round.create(round('regular', 5), sportbetRules).ok).toBe(true);
  });
});

describe('SU-7', () => {
  it('survival (ruled): no pick after round 38', () => {
    // Round 39 is the first play-off round: it cannot carry survival (R-10).
    expect(Round.create(round('play-offs', 2, true), ruledRules)).toEqual(
      refuse('survival-outside-regular-season'),
    );
    expect(Round.create(round('play-offs', 2, false), ruledRules).ok).toBe(
      true,
    );
  });

  it('survival (sportbet): an admin can flag any round for survival', () => {
    expect(Round.create(round('play-offs', 2, true), sportbetRules).ok).toBe(
      true,
    );
  });
});
