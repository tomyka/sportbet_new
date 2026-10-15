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

  it('recalculation (ruled): reads what the ruled set scores from: the odds it stored, else the votes (R-99), survival from the picks (R-5)', () => {
    expect(inputReadsOf(ruledRules)).toEqual({
      odds: 'stored-else-votes',
      survival: 'picks',
    });
  });
});
