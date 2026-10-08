import { describe, expect, it } from 'vitest';
import { oddsOfHundredths } from '../points/odds';
import { pointsOfHundredths, Points } from '../points/points';
import { CrowdOdds } from '../odds/crowd-odds';
import { MatchPrediction } from '../prediction/match-prediction';
import { oddsPanel } from '../prediction/predictions-list';
import type { StoredMatchRow } from '../recalculation/recalculation';
import { Season } from '../round/season';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import type { PlayerId, TeamId } from '../shared/ids';
import type { PredictionRowState } from '../prediction/predictions-list';
import {
  at,
  gameNo,
  makeGame,
  makeRound,
  player,
  rate,
  roundNo,
  score,
  unwrap,
} from '../testing';
import {
  activityFeed,
  fixtureDeck,
  gameOdds,
  roundProgress,
  statTiles,
} from './dashboard';

const P = player('1');

describe('roundProgress (MainController::getTournamentProgress)', () => {
  const season = unwrap(
    Season.create({
      rounds: [makeRound({ number: 1 }), makeRound({ number: 2 })],
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
          home: 'REA',
          away: 'FEN',
          tipOff: '2026-10-02T17:00:00Z',
          result: [70, 75],
        }),
        // 22:30 UTC on 10-02 is 01:30 on 10-03 in Vilnius.
        makeGame({
          id: 3,
          round: 1,
          home: 'PAO',
          away: 'MAC',
          tipOff: '2026-10-02T22:30:00Z',
        }),
        makeGame({
          id: 4,
          round: 1,
          home: 'BAR',
          away: 'ASV',
          tipOff: '2026-10-03T18:00:00Z',
        }),
        makeGame({
          id: 5,
          round: 1,
          home: 'MIL',
          away: 'BAY',
          tipOff: '2026-10-04T18:00:00Z',
        }),
        makeGame({
          id: 6,
          round: 2,
          home: 'ZAL',
          away: 'FEN',
          tipOff: '2026-10-03T19:00:00Z',
        }),
      ],
      endsAt: null,
    }),
  );

  it('counts the current round: scored, total, and the unscored games of the Vilnius day', () => {
    expect(
      roundProgress({
        season,
        current: roundNo(1),
        now: at('2026-10-03T08:00:00Z'),
      }),
    ).toEqual({ round: roundNo(1), scored: 2, total: 5, today: 2 });
  });

  it('is null with no current round', () => {
    expect(
      roundProgress({
        season,
        current: null,
        now: at('2026-10-03T08:00:00Z'),
      }),
    ).toBeNull();
  });
});

const GAMES = [1, 2, 3, 4, 5].map((id) =>
  makeGame({
    id,
    round: id <= 3 ? 1 : 2,
    home: 'ZAL',
    away: 'OLY',
    tipOff: `2026-10-0${String(id)}T18:00:00Z`,
    result: [80, 75],
  }),
);
const SEASON = unwrap(
  Season.create({
    rounds: [makeRound({ number: 1 }), makeRound({ number: 2, rate: 2 })],
    games: GAMES,
    endsAt: null,
  }),
);

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

const real = (game: number): MatchPrediction =>
  unwrap(
    MatchPrediction.enter({
      player: P,
      game: gameNo(game),
      home: 80,
      away: 75,
    }),
  );
const filledIn = (game: number): MatchPrediction =>
  MatchPrediction.fillIn({
    player: P,
    game: gameNo(game),
    score: score(80, 75),
    origin: 'fill-in',
    madeAt: at('2026-10-01T18:00:00Z'),
  });

describe('statTiles (MainController::getSnapshotData, R-71)', () => {
  it('serija: the run of fully correct games, newest first, within the tournament', () => {
    const tiles = statTiles({
      season: SEASON,
      rows: [
        row(P, 1, { winner: 7_950 }),
        row(P, 2, { winner: 0 }),
        row(P, 3, { winner: 7_950 }),
        row(P, 4, { winner: 15_900 }),
        row(P, 5, { winner: 15_900 }),
      ],
      predictions: [1, 2, 3, 4, 5].map(real),
    });
    expect(tiles?.serija).toBe(3);
  });

  it('serija: a fill-in ends the run, even one that named the winner', () => {
    expect(
      statTiles({
        season: SEASON,
        rows: [row(P, 4, { winner: 15_900 }), row(P, 5, { winner: 15_900 })],
        predictions: [real(4), filledIn(5)],
      })?.serija,
    ).toBe(0);
  });

  it("serija: a scored game without the player's row is passed over, as sportbet reads only rows", () => {
    expect(
      statTiles({
        season: SEASON,
        rows: [row(P, 3, { winner: 7_950 }), row(P, 5, { winner: 15_900 })],
        predictions: [real(3), real(5)],
      })?.serija,
    ).toBe(2);
  });

  it('bingo: the rows with bingo points', () => {
    expect(
      statTiles({
        season: SEASON,
        rows: [
          row(P, 1, { winner: 7_950, bingo: 5_000 }),
          row(P, 2),
          row(P, 3, { bingo: 5_000 }),
        ],
        predictions: [1, 2, 3].map(real),
      })?.bingo,
    ).toBe(2);
  });

  it('no rows: no tiles', () => {
    expect(statTiles({ season: SEASON, rows: [], predictions: [] })).toBeNull();
  });

  it('a row of a game outside the season (another tournament) is an impossible state', () => {
    expect(() =>
      statTiles({
        season: SEASON,
        rows: [row(P, 9, { winner: 7_950 })],
        predictions: [],
      }),
    ).toThrow('statTiles');
  });
});

describe('activityFeed (ActivityFeedController)', () => {
  const [ada, ben, cai, dan, eve, fay, gus] = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
  ].map(player);
  if (
    ada === undefined ||
    ben === undefined ||
    cai === undefined ||
    dan === undefined ||
    eve === undefined ||
    fay === undefined ||
    gus === undefined
  ) {
    throw new Error('seven players');
  }
  const usernames = new Map<PlayerId, string>([
    [ada, 'ada'],
    [ben, 'Ben'],
    [cai, 'čia'],
    [dan, 'dan'],
    [eve, 'eve'],
    [fay, 'fay'],
    [gus, 'gus'],
  ]);
  const teamName = (team: TeamId): string => `${team}-name`;
  const listedAll = new Set([ada, ben, cai, dan, eve, fay, gus]);

  it('bingos: the last three scored games with a bingo, newest first, the players by name', () => {
    const feed = activityFeed({
      season: SEASON,
      rows: [
        row(ada, 1, { bingo: 5_000 }),
        row(ada, 2, { bingo: 5_000 }),
        row(dan, 3, { bingo: 5_000 }),
        row(ben, 3, { bingo: 5_000 }),
        row(ada, 3, { bingo: 5_000 }),
        row(ada, 4),
        row(cai, 5, { bingo: 10_000 }),
      ],
      listed: listedAll,
      usernames,
      teamName,
      rules: sportbetRules,
    });
    expect(feed.bingos).toEqual([
      { game: gameNo(5), line: 'ZAL-name 80-75 OLY-name', players: 'čia' },
      {
        game: gameNo(3),
        line: 'ZAL-name 80-75 OLY-name',
        players: 'ada, Ben, dan',
      },
      { game: gameNo(2), line: 'ZAL-name 80-75 OLY-name', players: 'ada' },
    ]);
  });

  it('bingos: the names in the tie order of the rule set (R-30)', () => {
    const names = new Map<PlayerId, string>([
      [cai, 'yla'],
      [dan, 'jon'],
    ]);
    const rows = [row(cai, 1, { bingo: 5_000 }), row(dan, 1, { bingo: 5_000 })];
    const players = (rules: typeof sportbetRules): string | undefined =>
      activityFeed({
        season: SEASON,
        rows,
        listed: listedAll,
        usernames: names,
        teamName,
        rules,
      }).bingos[0]?.players;
    // MySQL's collation: "j" before "y"; Lithuanian: "y" before "j".
    expect(players(sportbetRules)).toBe('jon, yla');
    expect(players(ruledRules)).toBe('yla, jon');
  });

  it('bingos and runs: only listed players', () => {
    const feed = activityFeed({
      season: SEASON,
      rows: [row(ada, 1, { bingo: 5_000 }), row(ada, 5, { serija: 6_000 })],
      listed: new Set([ben]),
      usernames,
      teamName,
      rules: sportbetRules,
    });
    expect(feed).toEqual({ bingos: [], runs: [] });
  });

  it("runs: alive on the player's last scored game, at least three long, longest first, five at most", () => {
    const feed = activityFeed({
      season: SEASON,
      rows: [
        // Round 2 is rate 2: a step is 20, a run of three stores 40.
        row(ada, 5, { serija: 4_000 }), // 3
        row(ben, 5, { serija: 10_000 }), // 6
        row(cai, 4, { serija: 6_000 }), // 4
        row(dan, 5, { serija: 4_000 }), // 3
        row(eve, 3, { serija: 3_000 }), // round 1, rate 1: 4
        row(eve, 4, { serija: 0 }), // ...but eve's run has ended
        row(fay, 2, { serija: 1_000 }), // 2: too short
        row(fay, 3, { serija: 2_000 }), // 3
        row(gus, 5, { serija: 12_000 }), // 7
        row(gus, 4, { serija: 3_000 }), // below the threshold, but not gus's last
      ],
      listed: listedAll,
      usernames,
      teamName,
      rules: sportbetRules,
    });
    expect(feed.runs).toEqual([
      { username: 'gus', length: 7 },
      { username: 'Ben', length: 6 },
      { username: 'čia', length: 4 },
      { username: 'ada', length: 3 },
      { username: 'dan', length: 3 },
    ]);
  });
});

describe('fixtureDeck (MainController::loadApp, R-75)', () => {
  const line = (id: number, tipOff: string, state: PredictionRowState) => ({
    game: gameNo(id),
    tipOff: at(tipOff),
    state,
  });
  // now: 10-05 08:00 UTC, 11:00 in Vilnius.
  const now = at('2026-10-05T08:00:00Z');

  it("drops earlier days' played games, keeps the first three Vilnius days, by tip-off then id", () => {
    const deck = fixtureDeck(
      [
        line(7, '2026-10-08T18:00:00Z', 'open'),
        line(1, '2026-10-04T18:00:00Z', 'scored'),
        line(2, '2026-10-04T19:00:00Z', 'locked'),
        // 22:30 UTC on 10-04 is 01:30 on 10-05 in Vilnius: today.
        line(3, '2026-10-04T22:30:00Z', 'scored'),
        line(5, '2026-10-06T18:00:00Z', 'open'),
        line(4, '2026-10-06T18:00:00Z', 'open'),
        line(6, '2026-10-07T18:00:00Z', 'open'),
      ],
      now,
    );
    expect(deck.map(({ game }) => game)).toEqual([
      gameNo(2),
      gameNo(3),
      gameNo(4),
      gameNo(5),
    ]);
  });

  it('only an open game offers "Spėti"; a started or played one offers nothing (R-75)', () => {
    const deck = fixtureDeck(
      [
        line(1, '2026-10-05T06:00:00Z', 'scored'),
        line(2, '2026-10-05T07:00:00Z', 'locked'),
        line(3, '2026-10-05T18:00:00Z', 'open'),
      ],
      now,
    );
    expect(deck.map(({ predict }) => predict)).toEqual([false, false, true]);
  });

  it('keeps every field of the line it is given', () => {
    const [kept] = fixtureDeck(
      [{ ...line(1, '2026-10-05T18:00:00Z', 'open'), home: 'ZAL' }],
      now,
    );
    expect(kept?.home).toBe('ZAL');
  });
});

describe('gameOdds (games.blade.php hasRowOdds, R-61)', () => {
  const panel = oddsPanel(CrowdOdds.forGame([], ruledRules), rate(1));
  const both = { home: 85, away: 80 };

  it('a game not played with both scores predicted shows its odds panel', () => {
    expect(gameOdds({ state: 'open', predicted: both, panel })).toBe(panel);
    expect(gameOdds({ state: 'locked', predicted: both, panel })).toBe(panel);
  });

  it('a played game, or a prediction not both typed, shows none', () => {
    expect(
      gameOdds({ state: 'scored', predicted: both, panel: null }),
    ).toBeNull();
    expect(
      gameOdds({ state: 'open', predicted: { home: 85, away: null }, panel }),
    ).toBeNull();
    expect(
      gameOdds({ state: 'open', predicted: { home: null, away: null }, panel }),
    ).toBeNull();
  });
});
