import { describe, expect, it } from 'vitest';
import { oddsOfHundredths } from '../points/odds';
import { Points, pointsOfHundredths } from '../points/points';
import { standingsPointsOfTenThousandths } from '../points/standings-points';
import { MatchPrediction } from '../prediction/match-prediction';
import type {
  StoredMatchRow,
  SurvivalPoints,
} from '../recalculation/recalculation';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import type { PlayerId } from '../shared/ids';
import type { StandingsRow } from '../standings/standings-scoring';
import { at, gameNo, player, roundNo, score, team, unwrap } from '../testing';
import { leaderboardRows, type LeaderboardTournament } from './leaderboard';

const ada = player('1');
const ben = player('2');
const cai = player('3');
const usernames = new Map<PlayerId, string>([
  [ada, 'ada'],
  [ben, 'ben'],
  [cai, 'cai'],
]);

function row(
  who: PlayerId,
  game: number,
  points: { winner?: number; bingo?: number; serija?: number } = {},
): StoredMatchRow {
  const winner = pointsOfHundredths(points.winner ?? 0);
  const bingo = pointsOfHundredths(points.bingo ?? 0);
  return {
    player: who,
    game: gameNo(game),
    points: {
      winner,
      margin: Points.ZERO,
      bingo,
      full: winner.plus(bingo),
      odds: oddsOfHundredths(0),
    },
    serija: pointsOfHundredths(points.serija ?? 0),
  };
}

const standings = (who: PlayerId, tenThousandths: number): StandingsRow => ({
  player: who,
  team: team('11'),
  place: {
    points: standingsPointsOfTenThousandths(tenThousandths),
    odds: null,
  },
  playOffs: { points: null, odds: null },
  finalFour: { points: null, odds: null },
  final: { points: null, odds: null },
});

const survival = (who: PlayerId, hundredths: number): SurvivalPoints => ({
  player: who,
  round: roundNo(1),
  team: team('11'),
  points: pointsOfHundredths(hundredths),
  provisional: false,
  storedId: null,
});

const real = (who: PlayerId, game: number): MatchPrediction =>
  unwrap(
    MatchPrediction.enter({
      player: who,
      game: gameNo(game),
      home: 80,
      away: 75,
    }),
  );
const filledIn = (who: PlayerId, game: number): MatchPrediction =>
  MatchPrediction.fillIn(
    who,
    gameNo(game),
    score(80, 75),
    'fill-in',
    at('2026-10-01T18:00:00Z'),
  );

function tournament(
  part: Partial<LeaderboardTournament['rows']> & {
    listed: readonly PlayerId[];
    predictions?: readonly MatchPrediction[];
    isPublic?: boolean;
  },
): LeaderboardTournament {
  return {
    isPublic: part.isPublic ?? true,
    rows: {
      matches: part.matches ?? [],
      standings: part.standings ?? [],
      survival: part.survival ?? [],
    },
    listed: new Set(part.listed),
    predictions:
      part.predictions ??
      (part.matches ?? []).map(({ player: who, game }) => real(who, game)),
  };
}

describe('leaderboardRows (PlayerTotals::allTime, R-18, R-77)', () => {
  // ada: 150 match points over two tournaments and 300 standings points;
  // ben: 200 match points + 20 serija, nothing else.
  const tournaments = [
    tournament({
      listed: [ada, ben],
      matches: [
        row(ada, 1, { winner: 10_000 }),
        row(ben, 1, { winner: 20_000, serija: 2_000 }),
      ],
      standings: [standings(ada, 3_000_000)],
    }),
    tournament({ listed: [ada], matches: [row(ada, 11, { winner: 5_000 })] }),
  ];

  it('sportbet: match + serija over every tournament ranks', () => {
    expect(
      leaderboardRows({ tournaments, usernames, rules: sportbetRules }).map(
        ({ username, rank, totalCents }) => [username, rank, totalCents],
      ),
    ).toEqual([
      ['ben', 1, 22_000],
      ['ada', 2, 15_000],
    ]);
  });

  it('ruled: the full total ranks (R-18)', () => {
    expect(
      leaderboardRows({ tournaments, usernames, rules: ruledRules }).map(
        ({ username, rank, totalCents }) => [username, rank, totalCents],
      ),
    ).toEqual([
      ['ada', 1, 45_000],
      ['ben', 2, 22_000],
    ]);
  });

  it('a player without a match points row is not on it', () => {
    const rows = leaderboardRows({
      tournaments: [
        tournament({ listed: [cai], survival: [survival(cai, 2_200)] }),
      ],
      usernames,
      rules: ruledRules,
    });
    expect(rows).toEqual([]);
  });

  describe('a player switched off in one tournament (R-77)', () => {
    const split = [
      tournament({
        listed: [ada],
        matches: [
          row(ada, 1, { winner: 10_000 }),
          row(ben, 1, { winner: 30_000 }),
        ],
      }),
      tournament({
        listed: [ada, ben],
        matches: [
          row(ada, 11, { winner: 5_000 }),
          row(ben, 11, { winner: 5_000 }),
        ],
      }),
    ];

    it('ruled: counts only the tournaments where they are listed', () => {
      expect(
        leaderboardRows({
          tournaments: split,
          usernames,
          rules: ruledRules,
        }).map(({ username, totalCents }) => [username, totalCents]),
      ).toEqual([
        ['ada', 15_000],
        ['ben', 5_000],
      ]);
    });

    it('sportbet: one switch for the account, so they are not on it at all', () => {
      expect(
        leaderboardRows({
          tournaments: split,
          usernames,
          rules: sportbetRules,
        }).map(({ username }) => username),
      ).toEqual(['ada']);
    });
  });

  it('counts exact scores, right winners (real calls only) and games (fill-ins too)', () => {
    const [counted] = leaderboardRows({
      tournaments: [
        tournament({
          listed: [ada],
          matches: [
            row(ada, 1, { winner: 7_950, bingo: 5_000 }),
            row(ada, 2, { winner: 7_950 }),
            row(ada, 3, { winner: 0 }),
            row(ada, 4, { winner: 7_950 }),
          ],
          predictions: [
            real(ada, 1),
            real(ada, 2),
            real(ada, 3),
            filledIn(ada, 4),
          ],
        }),
        tournament({
          listed: [ada],
          matches: [row(ada, 11, { winner: 15_900, bingo: 10_000 })],
        }),
      ],
      usernames,
      rules: ruledRules,
    });
    expect(counted).toMatchObject({ exact: 2, winners: 3, games: 5 });
  });

  describe('a non-public tournament (R-77 amended, R-50)', () => {
    const withHidden = [
      tournament({ listed: [ada], matches: [row(ada, 1, { winner: 10_000 })] }),
      tournament({
        isPublic: false,
        listed: [ada, ben],
        matches: [
          row(ada, 11, { winner: 5_000 }),
          row(ben, 11, { winner: 30_000 }),
        ],
      }),
    ];

    it('ruled: its points never reach /leaderboard', () => {
      expect(
        leaderboardRows({
          tournaments: withHidden,
          usernames,
          rules: ruledRules,
        }).map(({ username, totalCents, games }) => [
          username,
          totalCents,
          games,
        ]),
      ).toEqual([['ada', 10_000, 1]]);
    });

    it('sportbet: every tournament counts, as PlayerTotals::allTime does', () => {
      expect(
        leaderboardRows({
          tournaments: withHidden,
          usernames,
          rules: sportbetRules,
        }).map(({ username, totalCents }) => [username, totalCents]),
      ).toEqual([
        ['ben', 30_000],
        ['ada', 15_000],
      ]);
    });
  });
});
