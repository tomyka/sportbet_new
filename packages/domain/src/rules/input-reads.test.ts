import { describe, expect, it } from 'vitest';
import { inputReadsOf } from './input-reads';
import { ruledRules, sportbetRules } from './rule-set';

describe('inputReadsOf', () => {
  it('recalculation (sportbet): reads what sportbet scores from: the stored odds (CO-7) and the stored survival rows (SU-10)', () => {
    expect(inputReadsOf(sportbetRules)).toEqual({
      odds: 'stored',
      survival: 'stored-rows',
    });
  });

  it('recalculation (ruled): reads what the ruled set scores from: odds from the votes, survival from the picks (R-5)', () => {
    expect(inputReadsOf(ruledRules)).toEqual({
      odds: 'from-votes',
      survival: 'picks',
    });
  });
});
