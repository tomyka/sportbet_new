import { describe, expect, it } from 'vitest';
import { goldenInputs } from '../golden/golden-inputs';
import { NAME_IDS } from '../golden/golden-scenario';
import {
  recalculateTournament,
  sumTournamentTotals,
} from '../recalculation/recalculation';
import type { PlayerId } from '../shared/ids';
import { player, unwrap } from '../testing';
import { leagueTableRows } from './league-table-rows';

const ada = NAME_IDS.player('ada');
const ben = NAME_IDS.player('ben');
const cai = NAME_IDS.player('cai');
const dan = NAME_IDS.player('dan');
const eve = player('eve');
const usernames = new Map<PlayerId, string>([
  [ada, 'ada'],
  [ben, 'ben'],
  [cai, 'cai'],
  [dan, 'dan'],
  [eve, 'eve'],
]);

function rowsOf(listed: readonly PlayerId[]) {
  const inputs = goldenInputs();
  const points = unwrap(recalculateTournament(inputs));
  return leagueTableRows({
    season: inputs.season,
    rows: points,
    totals: sumTournamentTotals(listed, points),
    listed: new Set(listed),
    usernames,
  });
}

describe('leagueTableRows (PointController::getAllUserPoints, R-73)', () => {
  it('ranks the listed players with their parts, stages and the history from when they were earned (R-17)', () => {
    const [first] = rowsOf([ada, ben, cai, dan]);
    expect(first).toMatchObject({
      player: ada,
      // R-138: match 211 + survival 24 + 44 + standings 940.
      totalCents: 121_900,
      matchCents: 21_100,
      survivalCents: 6_800,
      stages: { place: 76_000, playOffs: 18_000, finalFour: 0, final: 0 },
    });
    expect(first?.history.map(({ rank }) => rank)).toEqual([2, 4, 1]);
  });

  it('leaves out a player not listed, and lists one with no row at 0', () => {
    const rows = rowsOf([ada, ben, dan, eve]);
    expect(
      rows.map(({ username, totalCents }) => [username, totalCents]),
    ).toEqual([
      ['ada', 121_900],
      ['ben', 94_750],
      ['dan', 6_800],
      ['eve', 0],
    ]);
  });
});
