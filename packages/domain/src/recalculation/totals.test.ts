import { describe, expect, it } from 'vitest';
import { goldenInputs } from '../golden/golden-inputs';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { unwrap } from '../testing';
import { recalculateTournament, sumTournamentTotals } from './recalculation';

// Decision 2 of the slice 5 plan: the stored rows of a rule set add up to
// the totals recalculateTournament gave when it wrote them - one sum, so a
// page reading stored rows can never total them differently.

describe('sumTournamentTotals', () => {
  it.each([sportbetRules, ruledRules])(
    'totals ($name): the rows recalculateTournament writes add up to its own totals',
    (rules) => {
      const inputs = goldenInputs();
      const points = unwrap(recalculateTournament(inputs, rules));
      expect(sumTournamentTotals(inputs.players, points)).toEqual(
        points.totals,
      );
    },
  );

  it('totals: a player with no rows has a zero total, and is listed first as given', () => {
    const inputs = goldenInputs();
    const totals = sumTournamentTotals(inputs.players, {
      matches: [],
      standings: [],
      survival: [],
    });
    expect(totals.map(({ player }) => player)).toEqual(inputs.players);
    expect(totals.every(({ match }) => match.hundredths === 0)).toBe(true);
  });
});
