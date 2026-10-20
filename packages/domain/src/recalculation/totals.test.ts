import { describe, expect, it } from 'vitest';
import { goldenInputs } from '../golden/golden-inputs';
import { unwrap } from '../testing';
import { recalculateTournament, sumTournamentTotals } from './recalculation';

// Decision 2 of the slice 5 plan: the stored rows add up to
// the totals recalculateTournament gave when it wrote them - one sum, so a
// page reading stored rows can never total them differently.

describe('sumTournamentTotals', () => {
  it('totals: the rows recalculateTournament writes add up to its own totals', () => {
    const inputs = goldenInputs();
    const points = unwrap(recalculateTournament(inputs));
    expect(sumTournamentTotals(inputs.players, points)).toEqual(points.totals);
  });

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
