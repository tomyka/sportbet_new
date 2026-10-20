import { describe, expect, it } from 'vitest';
import { leagueTableRows } from '../dashboard/league-table-rows';
import { goldenInputs } from '../golden/golden-inputs';
import { NAME_IDS } from '../golden/golden-scenario';
import { Points } from '../points/points';
import {
  standingsPointsOfTenThousandths,
  StandingsPoints,
} from '../points/standings-points';
import {
  recalculateTournament,
  type PointsRows,
} from '../recalculation/recalculation';
import { Season } from '../round/season';
import { ruledRules } from '../rules/rule-set';
import type { RoundNumber } from '../shared/ids';
import type { StandingsRow } from '../standings/standings-scoring';
import {
  makeGame,
  makeRound,
  matchRow,
  player,
  roundNo,
  team,
  unwrap,
} from '../testing';
import { comparePlayers } from './compare';

const ada = NAME_IDS.player('ada');
const ben = NAME_IDS.player('ben');
const cai = NAME_IDS.player('cai');
const outsider = player('outsider');

function golden() {
  const inputs = goldenInputs();
  const points = unwrap(recalculateTournament(inputs, ruledRules));
  const listed = new Set([ada, ben, cai]);
  const table = leagueTableRows({
    season: inputs.season,
    rows: points,
    totals: points.totals,
    listed,
    usernames: new Map([...listed].map((who) => [who, String(who)])),
  });
  const roundNames = new Map<RoundNumber, string>([
    [roundNo(1), 'EL E1'],
    [roundNo(2), 'EL E2'],
  ]);
  return { inputs, points, table, roundNames };
}

const compareGolden = (viewer = ada, other = ben) => {
  const { inputs, points, table, roundNames } = golden();
  return comparePlayers({
    season: inputs.season,
    table,
    rows: points,
    roundNames,
    viewer,
    other,
  });
};

describe('comparePlayers', () => {
  it('each side`s rounds add up to its table total (R-85)', () => {
    for (const [viewer, other] of [
      [ada, ben],
      [cai, ada],
    ] as const) {
      const result = unwrap(compareGolden(viewer, other));
      const sum = (pick: 'meCents' | 'themCents') =>
        result.rounds.reduce((total, round) => total + round[pick], 0);
      expect(sum('meCents')).toBe(result.me.totalCents);
      expect(sum('themCents')).toBe(result.them.totalCents);
    }
  });

  it('puts standings in the round of its anchor game and survival in its pick`s round', () => {
    const result = unwrap(compareGolden());
    // ada (R-138): round 1 holds h1 and h2 match points (121.5 - 140) and the
    // survival 24 of its team's game; round 2 holds h3 (229.5), the survival
    // 44 and standings 940 (the season has no round 38: its last game).
    expect(result.rounds).toEqual([
      { round: roundNo(1), name: 'EL E1', meCents: 550, themCents: 13_750 },
      { round: roundNo(2), name: 'EL E2', meCents: 121_350, themCents: 81_000 },
    ]);
  });

  it('gives each side`s rank, total and parts from its table row', () => {
    const result = unwrap(compareGolden());
    // R-138: match 211 + survival 24 + 44 + standings 940.
    expect(result.me).toMatchObject({
      player: ada,
      username: 'ada',
      rank: 1,
      totalCents: 121_900,
    });
    expect(result.them.player).toBe(ben);
    expect(result.me.matchCents).toBe(21_100);
    expect(result.me.serijaCents).toBe(0);
    expect(result.me.standingsCents).toBe(94_000);
    expect(result.me.survivalCents).toBe(6_800);
    expect(result.me.bingo).toBe(1);
  });

  it('records the rounds won and lost', () => {
    const { inputs, points, table, roundNames } = golden();
    // ben loses round 1 (137.5 to 242) and wins round 2 (810 to 169.5), R-138.
    const result = unwrap(
      comparePlayers({
        season: inputs.season,
        table,
        rows: points,
        roundNames,
        viewer: ben,
        other: cai,
      }),
    );
    expect(result.record).toEqual({ wins: 1, draws: 0, losses: 1 });
  });

  it('counts a draw when both sides have the same cents in a round', () => {
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
        ],
        endsAt: null,
      }),
    );
    const rows = {
      matches: [
        matchRow(ada, 1, { winner: 5000 }),
        matchRow(ben, 1, { winner: 5000 }),
      ],
      standings: [],
      survival: [],
    };
    const table = leagueTableRows({
      season,
      rows,
      totals: [ada, ben].map((who) => ({
        player: who,
        match: unwrap(Points.ofHundredths(5000)),
        serija: Points.ZERO,
        standings: StandingsPoints.ZERO,
        survival: Points.ZERO,
      })),
      listed: new Set([ada, ben]),
      usernames: new Map([
        [ada, 'ada'],
        [ben, 'ben'],
      ]),
    });
    const result = unwrap(
      comparePlayers({
        season,
        table,
        rows,
        roundNames: new Map([[roundNo(1), 'E1']]),
        viewer: ada,
        other: ben,
      }),
    );
    expect(result.record).toEqual({ wins: 0, draws: 1, losses: 0 });
  });

  it('has no record and no rounds before any game is scored', () => {
    const { inputs, table, roundNames } = golden();
    const unscored = unwrap(
      Season.create({
        rounds: inputs.season.rounds,
        games: inputs.season.games.map((game) => game.withoutResult()),
        endsAt: null,
      }),
    );
    const result = unwrap(
      comparePlayers({
        season: unscored,
        table,
        rows: { matches: [], standings: [], survival: [] },
        roundNames,
        viewer: ada,
        other: ben,
      }),
    );
    expect(result.rounds).toEqual([]);
    expect(result.record).toBeNull();
  });

  it('rounds the running total once, so the rounds add up to the cent', () => {
    const season = unwrap(
      Season.create({
        rounds: [
          makeRound({ number: 1 }),
          makeRound({ number: 2, stage: 'play-offs', survival: false }),
        ],
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
            round: 2,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-02T18:00:00Z',
            result: [80, 75],
          }),
        ],
        endsAt: null,
      }),
    );
    const line = (tenThousandths: number | null) => ({
      points:
        tenThousandths === null
          ? null
          : standingsPointsOfTenThousandths(tenThousandths),
      odds: null,
    });
    const standing: StandingsRow = {
      player: ada,
      team: team('ZAL'),
      place: line(null),
      playOffs: line(50),
      finalFour: line(50),
      final: line(null),
    };
    const rows: Pick<PointsRows, 'matches' | 'standings' | 'survival'> = {
      matches: [],
      standings: [standing],
      survival: [],
    };
    const table = leagueTableRows({
      season,
      rows,
      totals: [ada, ben].map((who) => ({
        player: who,
        match: Points.ZERO,
        serija: Points.ZERO,
        standings:
          who === ada
            ? standingsPointsOfTenThousandths(100)
            : StandingsPoints.ZERO,
        survival: Points.ZERO,
      })),
      listed: new Set([ada, ben]),
      usernames: new Map([
        [ada, 'ada'],
        [ben, 'ben'],
      ]),
    });
    const result = unwrap(
      comparePlayers({
        season,
        table,
        rows,
        roundNames: new Map([
          [roundNo(1), 'E1'],
          [roundNo(2), 'E2'],
        ]),
        viewer: ada,
        other: ben,
      }),
    );
    expect(result.me.totalCents).toBe(1);
    expect(result.rounds.map(({ meCents }) => meCents)).toEqual([1, 0]);
  });

  it('refuses oneself before anything else', () => {
    const { inputs, points, table, roundNames } = golden();
    const refused = comparePlayers({
      season: inputs.season,
      table,
      rows: points,
      roundNames,
      viewer: outsider,
      other: outsider,
    });
    expect(refused).toEqual({ ok: false, refusal: 'self' });
  });

  it('refuses a player who is not listed, as the other or as the viewer', () => {
    expect(compareGolden(ada, outsider)).toEqual({
      ok: false,
      refusal: 'not-listed',
    });
    expect(compareGolden(outsider, ada)).toEqual({
      ok: false,
      refusal: 'not-listed',
    });
  });
});
