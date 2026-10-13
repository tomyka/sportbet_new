import { describe, expect, it } from 'vitest';
import { goldenInputs } from '../golden/golden-inputs';
import { GOLDEN, NAME_IDS } from '../golden/golden-scenario';
import { standingsOddsTenThousandths } from '../odds/crowd-ratio';
import { standingsOddsOfTenThousandths } from '../points/odds';
import { phpRoundScaled } from '../points/php-round';
import { standingsPointsOfTenThousandths } from '../points/standings-points';
import { recalculateTournament } from '../recalculation/recalculation';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import type { PlayerId } from '../shared/ids';
import { StandingsPrediction } from '../standings/standings-prediction';
import type { StandingsLine } from '../standings/standings-scoring';
import { TeamOutcomes } from '../standings/team-outcomes';
import {
  leagueRow,
  player,
  team,
  teamOutcome,
  teamPick,
  unwrap,
  type StandingsColumns,
} from '../testing';
import {
  standingsSummary,
  type StandingsCell,
  type StandingsSummary,
} from './standings-summary';

const ada = NAME_IDS.player('ada');
const ben = NAME_IDS.player('ben');
const cai = NAME_IDS.player('cai');
const dan = NAME_IDS.player('dan');
const goldenTable = [ada, ben, cai, dan].map((who) =>
  leagueRow(who, String(who)),
);

function goldenSummary(rules: RuleSet): StandingsSummary {
  const inputs = goldenInputs();
  const points = unwrap(recalculateTournament(inputs, rules));
  return standingsSummary({
    table: goldenTable,
    teams: GOLDEN.teams.map((name) => ({
      id: NAME_IDS.team(name),
      name,
    })),
    outcomes: inputs.outcomes,
    predictions: inputs.standings,
    rows: points,
  });
}

const cellOf = (
  summary: StandingsSummary,
  who: PlayerId,
  name: string,
): StandingsCell => {
  const cell = summary.teams
    .find((row) => row.team === team(name))
    ?.cells.get(who);
  if (cell === undefined) throw new Error(`no cell for ${name}`);
  return cell;
};

describe('standingsSummary on the golden scenario (sportbetRules)', () => {
  const summary = goldenSummary(sportbetRules);

  it('lists the teams in the order given, with their names, and the columns in table order', () => {
    expect(summary.teams.map(({ name }) => name)).toEqual([
      'ZAL',
      'OLY',
      'REA',
      'FEN',
    ]);
    expect(summary.columns.map(({ username }) => username)).toEqual([
      'ada',
      'ben',
      'cai',
      'dan',
    ]);
  });

  it('gives a player without predictions no cell', () => {
    expect(
      summary.teams.every(
        ({ cells }) => !cells.has(cai) && !cells.has(dan) && cells.has(ada),
      ),
    ).toBe(true);
  });

  it('badges an exact place a hit, with its crowd bonus in the popover', () => {
    const zal = cellOf(summary, ada, 'ZAL');
    expect(zal.place).toEqual({
      shown: '1',
      verdict: 'hit',
      popover: { pointsCents: 38_000, base: '190.0', multiplier: '2.00' },
    });
  });

  it('badges a wrong place a miss, its popover without a bonus when there are no odds', () => {
    expect(cellOf(summary, ben, 'OLY').place).toEqual({
      shown: '1',
      verdict: 'miss',
      popover: { pointsCents: 18_000, base: null, multiplier: null },
    });
  });

  it('badges a tick on a team that got through a hit, one that did not a miss', () => {
    expect(cellOf(summary, ada, 'ZAL').playOffs).toMatchObject({
      shown: '✓',
      verdict: 'hit',
    });
    expect(cellOf(summary, ben, 'REA').playOffs).toMatchObject({
      shown: '✗',
      verdict: 'miss',
      popover: { pointsCents: 0, base: null, multiplier: null },
    });
  });

  it('shows "-" and none for a tick not made, with no popover', () => {
    expect(cellOf(summary, ada, 'REA').playOffs).toEqual({
      shown: '-',
      verdict: 'none',
      popover: null,
    });
    expect(cellOf(summary, ada, 'ZAL').final).toEqual({
      shown: '-',
      verdict: 'none',
      popover: null,
    });
  });

  it('keeps a tick whose bonus is 0 without a bonus in its badge popover, and with ×1.00 in the total', () => {
    const zal = cellOf(summary, ada, 'ZAL');
    expect(zal.playOffs.popover).toEqual({
      pointsCents: 6_000,
      base: null,
      multiplier: null,
    });
    expect(zal.totalLines).toEqual([
      {
        stage: 'place',
        pointsCents: 38_000,
        base: '190.0',
        multiplier: '2.00',
      },
      {
        stage: 'playOffs',
        pointsCents: 6_000,
        base: '60.0',
        multiplier: '1.00',
      },
    ]);
  });

  it('sums each cell`s stages and lists no total line for a total of 0', () => {
    expect(cellOf(summary, ada, 'ZAL').totalCents).toBe(44_000);
    expect(cellOf(summary, ben, 'REA').totalCents).toBe(18_000);
    expect(cellOf(summary, ada, 'REA').totalLines).toHaveLength(1);
  });
});

describe('standingsSummary: a stage is judged only once decided (ST-6)', () => {
  const cellFor = (
    pickColumns: StandingsColumns,
    outcome: StandingsColumns,
    others: StandingsColumns = {},
  ): StandingsCell => {
    const ada = player('ada');
    const summary = standingsSummary({
      table: [leagueRow(ada, 'ada')],
      teams: [{ id: team('ZAL'), name: 'ZAL' }],
      outcomes: unwrap(
        TeamOutcomes.stored(
          [teamOutcome('ZAL', outcome), teamOutcome('OLY', others)],
          false,
        ),
      ),
      predictions: [
        unwrap(
          StandingsPrediction.enter(ada, [
            teamPick('ZAL', { finalFour: true, ...pickColumns }),
          ]),
        ),
      ],
      rows: { standings: [] },
    });
    const cell = summary.teams[0]?.cells.get(ada);
    if (cell === undefined) throw new Error('no cell');
    return cell;
  };

  it('a tick is pending, shown "✓", until any team holds the stage', () => {
    expect(cellFor({}, {}).finalFour).toMatchObject({
      shown: '✓',
      verdict: 'pending',
    });
  });

  it('after that a tick on a team that is not there is a miss', () => {
    expect(cellFor({}, {}, { finalFour: true }).finalFour).toMatchObject({
      shown: '✗',
      verdict: 'miss',
    });
  });

  it('the place is pending until it is entered', () => {
    expect(cellFor({ place: 3 }, {}).place.verdict).toBe('pending');
    expect(cellFor({ place: 3 }, { place: 3 }).place.verdict).toBe('hit');
  });

  it('the final place is pending while the Final Four is undecided or the final not played', () => {
    expect(cellFor({ finalPlace: 1 }, {}).final.verdict).toBe('pending');
    expect(cellFor({ finalPlace: 1 }, { finalFour: true }).final.verdict).toBe(
      'pending',
    );
  });

  it('the final place of a team out before the Final Four is a miss', () => {
    expect(
      cellFor({ finalPlace: 1 }, {}, { finalFour: true }).final.verdict,
    ).toBe('miss');
  });

  it('a wrong final place is partial with the Final Four ticked, a hit when exact', () => {
    const reached = { finalFour: true, finalPlace: 2 as const };
    expect(cellFor({ finalPlace: 1 }, reached).final.verdict).toBe('partial');
    expect(cellFor({ finalPlace: 2 }, reached).final.verdict).toBe('hit');
  });
});

describe('standingsSummary: "Spėjimo taškai" and "Koeficientas" equal sportbet`s division', () => {
  /** sportbetRules and ruledRules' every golden line, and a sweep of crowds. */
  const wholeBases = [60, 120, 190, 36, 30, 27, 18, 9];

  const popoverOf = (line: StandingsLine) => {
    const ada = player('ada');
    const summary = standingsSummary({
      table: [leagueRow(ada, 'ada')],
      teams: [{ id: team('ZAL'), name: 'ZAL' }],
      outcomes: unwrap(
        TeamOutcomes.stored([teamOutcome('ZAL', { playOffs: true })], false),
      ),
      predictions: [
        unwrap(
          StandingsPrediction.enter(ada, [teamPick('ZAL', { playOffs: true })]),
        ),
      ],
      rows: {
        standings: [
          {
            player: ada,
            team: team('ZAL'),
            place: { points: null, odds: null },
            playOffs: line,
            finalFour: { points: null, odds: null },
            final: { points: null, odds: null },
          },
        ],
      },
    });
    return summary.teams[0]?.cells.get(ada)?.playOffs.popover;
  };

  /** round(points / (1 + odds), 1) and round(1 + odds, 2) as PHP computes them on floats. */
  const sportbetBase = (line: StandingsLine): string =>
    (
      phpRoundScaled(
        (line.points?.tenThousandths ?? 0) /
          10_000 /
          (1 + (line.odds?.tenThousandths ?? 0) / 10_000),
        1,
      ) / 10
    ).toFixed(1);
  const sportbetMultiplier = (line: StandingsLine): string =>
    (
      phpRoundScaled(1 + (line.odds?.tenThousandths ?? 0) / 10_000, 2) / 100
    ).toFixed(2);

  it('golden scenario: base and multiplier equal sportbet`s division to the shown places', () => {
    let compared = 0;
    for (const rules of [sportbetRules, ruledRules]) {
      const points = unwrap(recalculateTournament(goldenInputs(), rules));
      for (const row of points.standings) {
        for (const line of [
          row.place,
          row.playOffs,
          row.finalFour,
          row.final,
        ]) {
          if (
            line.odds === null ||
            line.odds.tenThousandths === 0 ||
            line.points === null ||
            line.points.tenThousandths === 0
          ) {
            continue;
          }
          const popover = popoverOf(line);
          expect(popover?.base).toBe(sportbetBase(line));
          expect(popover?.multiplier).toBe(sportbetMultiplier(line));
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(4);
  });

  it('every crowd of up to 40 and every base gives the same as the float division', () => {
    for (const base of wholeBases) {
      for (let counted = 1; counted <= 40; counted++) {
        for (let same = 1; same <= counted; same++) {
          const odds = standingsOddsTenThousandths(counted, same);
          if (odds === 0) continue;
          const line: StandingsLine = {
            points: standingsPointsOfTenThousandths(base * (10_000 + odds)),
            odds: standingsOddsOfTenThousandths(odds),
          };
          const popover = popoverOf(line);
          expect(popover?.base).toBe(sportbetBase(line));
          expect(popover?.multiplier).toBe(sportbetMultiplier(line));
        }
      }
    }
  });
});
