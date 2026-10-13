import { describe, expect, it } from 'vitest';
import { leagueTableRows } from '../dashboard/league-table-rows';
import { goldenInputs } from '../golden/golden-inputs';
import { GOLDEN, NAME_IDS } from '../golden/golden-scenario';
import { Points } from '../points/points';
import { standingsPointsWhole } from '../points/standings-points';
import { recalculateTournament } from '../recalculation/recalculation';
import type { PointsRows } from '../recalculation/recalculation';
import { Season } from '../round/season';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import type { PlayerId, TeamId } from '../shared/ids';
import {
  gameNo,
  leagueRow,
  makeGame,
  makeRound,
  matchRow,
  player,
  team,
  unwrap,
} from '../testing';
import { pointsChart } from './points-chart';

const goldenNames = new Map<TeamId, string>(
  GOLDEN.teams.map((name) => [NAME_IDS.team(name), name]),
);

function goldenChart(rules: RuleSet) {
  const inputs = goldenInputs();
  const points = unwrap(recalculateTournament(inputs, rules));
  const listed = new Set(inputs.players);
  const table = leagueTableRows({
    season: inputs.season,
    rows: points,
    totals: points.totals,
    listed,
    usernames: new Map([...listed].map((who) => [who, String(who)])),
    rules,
  });
  return {
    table,
    chart: pointsChart({
      season: inputs.season,
      table,
      teamNames: goldenNames,
    }),
  };
}

describe('pointsChart', () => {
  it('every line ends at its row`s table total, under both rule sets (R-85)', () => {
    for (const rules of [sportbetRules, ruledRules]) {
      const { table, chart } = goldenChart(rules);
      expect(chart.lines).toHaveLength(table.length);
      for (const [index, row] of table.entries()) {
        expect(chart.lines[index]?.totalsCents.at(-1)).toBe(row.totalCents);
      }
    }
  });

  it('counts standings and survival at the games R-72 places them (ruledRules)', () => {
    const { chart } = goldenChart(ruledRules);
    const ada = chart.lines.find(({ username }) => username === 'ada');
    expect(ada?.totalsCents).toEqual([12_550, 9_250, 123_400]);
  });

  it('places a standings line at an unscored game at the latest scored game', () => {
    const season = unwrap(
      Season.create({
        rounds: [makeRound({ number: 1 })],
        games: [
          makeGame({
            id: 1,
            round: 1,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-01T18:00:00Z',
            result: [80, 75],
          }),
          makeGame({
            id: 2,
            round: 1,
            home: 'ZAL',
            away: 'REA',
            tipOff: '2026-10-08T18:00:00Z',
          }),
        ],
        endsAt: null,
      }),
    );
    const ada = player('ada');
    const rows: Pick<PointsRows, 'matches' | 'standings' | 'survival'> = {
      matches: [matchRow(ada, 1, { winner: 5000 })],
      standings: [
        {
          player: ada,
          team: team('ZAL'),
          place: { points: standingsPointsWhole(190), odds: null },
          playOffs: { points: null, odds: null },
          finalFour: { points: null, odds: null },
          final: { points: null, odds: null },
        },
      ],
      survival: [],
    };
    const table = leagueTableRows({
      season,
      rows,
      totals: [
        {
          player: ada,
          match: unwrap(Points.ofHundredths(5000)),
          serija: Points.ZERO,
          standings: standingsPointsWhole(190),
          survival: Points.ZERO,
        },
      ],
      listed: new Set([ada]),
      usernames: new Map([[ada, 'ada']]),
      rules: ruledRules,
    });
    const chart = pointsChart({
      season,
      table,
      teamNames: new Map([
        [team('ZAL'), 'ZAL'],
        [team('OLY'), 'OLY'],
        [team('REA'), 'REA'],
      ]),
    });
    expect(chart.lines[0]?.totalsCents).toEqual([24_000]);
  });

  it('takes the x-axis from the scored games by tip-off then id, labelled by team', () => {
    const { chart } = goldenChart(sportbetRules);
    expect(chart.games).toEqual([
      { game: NAME_IDS.game(1), label: 'ZAL - OLY' },
      { game: NAME_IDS.game(2), label: 'REA - FEN' },
      { game: NAME_IDS.game(3), label: 'ZAL - FEN' },
    ]);
  });

  it('labels with characters, not bytes: "Šiauliai" is "ŠIA"', () => {
    const season = unwrap(
      Season.create({
        rounds: [makeRound({ number: 1 })],
        games: [
          makeGame({
            id: 1,
            round: 1,
            home: 'S',
            away: 'K',
            tipOff: '2026-10-01T18:00:00Z',
            result: [80, 75],
          }),
        ],
        endsAt: null,
      }),
    );
    const ada = player('ada');
    const table = [
      leagueRow(ada, 'ada', {
        history: [{ game: gameNo(1), totalCents: 0, gainedCents: 0, rank: 1 }],
      }),
    ];
    const chart = pointsChart({
      season,
      table,
      teamNames: new Map([
        [team('S'), 'Šiauliai'],
        [team('K'), 'ž'],
      ]),
    });
    expect(chart.games[0]?.label).toBe('ŠIA - Ž');
  });

  it('says "1 rungtynės" for one game and "N rungtynių" otherwise', () => {
    expect(goldenChart(sportbetRules).chart.count).toBe('3 rungtynių');
    const empty = pointsChart({
      season: unwrap(Season.create({ rounds: [], games: [], endsAt: null })),
      table: [],
      teamNames: new Map(),
    });
    expect(empty.count).toBe('0 rungtynių');
  });

  it('draws points up to 40 games and not at 41', () => {
    const chartOf = (games: number) =>
      pointsChart({
        season: unwrap(
          Season.create({
            rounds: [makeRound({ number: 1 })],
            games: Array.from({ length: games }, (_, index) =>
              makeGame({
                id: index + 1,
                round: 1,
                home: 'ZAL',
                away: 'OLY',
                tipOff: '2026-10-01T18:00:00Z',
                result: [80, 75],
              }),
            ),
            endsAt: null,
          }),
        ),
        table: [],
        teamNames: new Map([
          [team('ZAL'), 'ZAL'],
          [team('OLY'), 'OLY'],
        ]),
      });
    expect(chartOf(40).drawPoints).toBe(true);
    expect(chartOf(41).drawPoints).toBe(false);
  });

  it('gives no games and empty lines when no game is scored', () => {
    const ada = player('ada');
    const chart = pointsChart({
      season: unwrap(
        Season.create({
          rounds: [makeRound({ number: 1 })],
          games: [
            makeGame({
              id: 1,
              round: 1,
              home: 'ZAL',
              away: 'OLY',
              tipOff: '2026-10-01T18:00:00Z',
            }),
          ],
          endsAt: null,
        }),
      ),
      table: [leagueRow(ada, 'ada')],
      teamNames: new Map(),
    });
    expect(chart.games).toEqual([]);
    expect(chart.lines).toEqual([
      { player: ada, username: 'ada', series: 1, totalsCents: [] },
    ]);
  });

  it('picks a series colour by position, wrapping after ten', () => {
    const players: PlayerId[] = Array.from({ length: 12 }, (_, index) =>
      player(`p${String(index)}`),
    );
    const chart = pointsChart({
      season: unwrap(Season.create({ rounds: [], games: [], endsAt: null })),
      table: players.map((who) => leagueRow(who, String(who))),
      teamNames: new Map(),
    });
    expect(chart.lines.map(({ series }) => series)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2,
    ]);
  });

  it('a history that is not the scored games is an impossible state', () => {
    const ada = player('ada');
    expect(() =>
      pointsChart({
        season: unwrap(Season.create({ rounds: [], games: [], endsAt: null })),
        table: [
          leagueRow(ada, 'ada', {
            history: [
              {
                game: NAME_IDS.game(1),
                totalCents: 0,
                gainedCents: 0,
                rank: 1,
              },
            ],
          }),
        ],
        teamNames: new Map(),
      }),
    ).toThrow('not the scored games');
  });
});
