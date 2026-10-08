import { describe, expect, it } from 'vitest';
import { goldenInputs } from '../golden/golden-inputs';
import { NAME_IDS } from '../golden/golden-scenario';
import {
  recalculateTournament,
  sumTournamentTotals,
} from '../recalculation/recalculation';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
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

function rowsUnder(rules: RuleSet, listed: readonly PlayerId[]) {
  const inputs = goldenInputs();
  const points = unwrap(recalculateTournament(inputs, rules));
  return leagueTableRows({
    season: inputs.season,
    rows: points,
    totals: sumTournamentTotals(listed, points),
    listed: new Set(listed),
    usernames,
    rules,
  });
}

describe('leagueTableRows (PointController::getAllUserPoints, R-73)', () => {
  it('ranks the listed players with their parts, stages and history (sportbetRules)', () => {
    const [first, ...rest] = rowsUnder(sportbetRules, [ada, ben, cai, dan]);
    expect({ ...first, history: undefined }).toEqual({
      player: ada,
      username: 'ada',
      rank: 1,
      totalCents: 193_400,
      matchCents: 26_000,
      serijaCents: 0,
      standingsCents: 164_000,
      survivalCents: 3_400,
      bingo: 1,
      stages: { place: 152_000, playOffs: 12_000, finalFour: 0, final: 0 },
      history: undefined,
    });
    expect(first?.history.map(({ rank }) => rank)).toEqual([1, 1, 1]);
    expect(rest.map(({ username, rank }) => [username, rank])).toEqual([
      ['ben', 2],
      ['cai', 3],
      ['dan', 4],
    ]);
  });

  it('under ruledRules: the ruled standings and the history from when they were earned (R-17)', () => {
    const [first] = rowsUnder(ruledRules, [ada, ben, cai, dan]);
    expect(first).toMatchObject({
      player: ada,
      totalCents: 123_400,
      stages: { place: 76_000, playOffs: 18_000, finalFour: 0, final: 0 },
    });
    expect(first?.history.map(({ rank }) => rank)).toEqual([2, 3, 1]);
  });

  it('leaves out a player not listed, and lists one with no row at 0', () => {
    const rows = rowsUnder(ruledRules, [ada, ben, dan, eve]);
    expect(
      rows.map(({ username, totalCents }) => [username, totalCents]),
    ).toEqual([
      ['ada', 123_400],
      ['ben', 97_850],
      ['dan', 3_400],
      ['eve', 0],
    ]);
  });
});
