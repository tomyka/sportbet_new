import { describe, expect, it } from 'vitest';
import { oddsOfHundredths } from '../points/odds';
import { pointsOfHundredths, Points } from '../points/points';
import { standingsPointsOfTenThousandths } from '../points/standings-points';
import type {
  StoredMatchRow,
  SurvivalPoints,
} from '../recalculation/recalculation';
import { Season } from '../round/season';
import type {
  StandingsLine,
  StandingsRow,
} from '../standings/standings-scoring';
import type { GameId, PlayerId, TeamId } from '../shared/ids';
import {
  gameNo,
  makeGame,
  makeRound,
  player,
  roundNo,
  team,
  unwrap,
} from '../testing';
import type { Game } from '../round/game';
import { earnedPointsOf } from './earned-points';

const sp = standingsPointsOfTenThousandths;
const P = player('1');
const T = team('ZAL');

const A = gameNo(1);
const B = gameNo(2);
const C = gameNo(3);
const D = gameNo(4);
const E = gameNo(5);
const F = gameNo(6);

/** Round 38 (A day 1, B day 2), 39 play-in (C), 40 play-offs (D), 41 Final Four (E), 42 final (F); T plays A and D. */
const GAMES: readonly Game[] = [
  makeGame({
    id: 1,
    round: 38,
    home: 'ZAL',
    away: 'OLY',
    tipOff: '2027-04-01T18:00:00Z',
  }),
  makeGame({
    id: 2,
    round: 38,
    home: 'PAO',
    away: 'RMB',
    tipOff: '2027-04-02T18:00:00Z',
  }),
  makeGame({
    id: 3,
    round: 39,
    home: 'PAO',
    away: 'OLY',
    tipOff: '2027-04-03T18:00:00Z',
  }),
  makeGame({
    id: 4,
    round: 40,
    home: 'RMB',
    away: 'ZAL',
    tipOff: '2027-04-04T18:00:00Z',
  }),
  makeGame({
    id: 5,
    round: 41,
    home: 'RMB',
    away: 'OLY',
    tipOff: '2027-04-05T18:00:00Z',
  }),
  makeGame({
    id: 6,
    round: 42,
    home: 'RMB',
    away: 'PAO',
    tipOff: '2027-04-06T18:00:00Z',
  }),
];

function seasonOf(ids: readonly GameId[]): Season {
  return unwrap(
    Season.create({
      rounds: [
        makeRound({ number: 38 }),
        makeRound({ number: 39, stage: 'play-in', survival: false }),
        makeRound({ number: 40, stage: 'play-offs', survival: false }),
        makeRound({ number: 41, stage: 'final-four', survival: false }),
        makeRound({ number: 42, stage: 'final', survival: false }),
      ],
      games: GAMES.filter((game) => ids.includes(game.id)),
      endsAt: null,
    }),
  );
}

const season = seasonOf([A, B, C, D, E, F]);

function matchRow(
  who: PlayerId,
  game: GameId,
  fullHundredths: number,
  serijaHundredths: number,
): StoredMatchRow {
  return {
    player: who,
    game,
    points: {
      winner: Points.ZERO,
      margin: Points.ZERO,
      bingo: Points.ZERO,
      full: pointsOfHundredths(fullHundredths),
      odds: oddsOfHundredths(0),
    },
    serija: pointsOfHundredths(serijaHundredths),
  };
}

const line = (n: number | null): StandingsLine => ({
  points: n === null ? null : sp(n),
  odds: null,
});

function standingsRow(
  who: PlayerId,
  of: TeamId,
  lines: {
    place: number | null;
    playOffs: number | null;
    finalFour: number | null;
    final: number | null;
  },
): StandingsRow {
  return {
    player: who,
    team: of,
    place: line(lines.place),
    playOffs: line(lines.playOffs),
    finalFour: line(lines.finalFour),
    final: line(lines.final),
  };
}

function survivalRow(
  who: PlayerId,
  round: number,
  of: TeamId,
  hundredths: number | null,
): SurvivalPoints {
  return {
    player: who,
    round: roundNo(round),
    team: of,
    points: hundredths === null ? null : pointsOfHundredths(hundredths),
    provisional: false,
    storedId: null,
  };
}

describe('earnedPointsOf (R-17, R-72)', () => {
  it('a match row counts its full points and its serija at its own game', () => {
    const earned = earnedPointsOf(season, {
      matches: [matchRow(P, A, 1234, 200)],
      standings: [],
      survival: [],
    });
    expect(earned).toEqual([
      { player: P, kind: 'match', points: sp(123_400), atGame: A },
      { player: P, kind: 'serija', points: sp(20_000), atGame: A },
    ]);
  });

  it("a table place counts from round 38's last game; each tick from its stage's last game", () => {
    const earned = earnedPointsOf(season, {
      matches: [],
      standings: [
        standingsRow(P, T, {
          place: 1_900_000,
          playOffs: 500_000,
          finalFour: 700_000,
          final: 900_000,
        }),
      ],
      survival: [],
    });
    expect(earned).toEqual([
      { player: P, kind: 'standings', points: sp(1_900_000), atGame: B },
      { player: P, kind: 'standings', points: sp(500_000), atGame: C },
      { player: P, kind: 'standings', points: sp(700_000), atGame: D },
      { player: P, kind: 'standings', points: sp(900_000), atGame: F },
    ]);
  });

  it('a line not yet decided (null) earns nothing', () => {
    expect(
      earnedPointsOf(season, {
        matches: [],
        standings: [
          standingsRow(P, T, {
            place: null,
            playOffs: null,
            finalFour: null,
            final: null,
          }),
        ],
        survival: [],
      }),
    ).toEqual([]);
  });

  it("a tick whose stage has no game yet counts from the season's last game", () => {
    const regularOnly = seasonOf([A, B]);
    expect(
      earnedPointsOf(regularOnly, {
        matches: [],
        standings: [
          standingsRow(P, T, {
            place: null,
            playOffs: 500_000,
            finalFour: 700_000,
            final: null,
          }),
        ],
        survival: [],
      }).map(({ atGame }) => atGame),
    ).toEqual([B, B]);
  });

  it("the final place without a final game counts from the season's last game (R-72)", () => {
    const noFinal = seasonOf([A, B, C, D, E]);
    expect(
      earnedPointsOf(noFinal, {
        matches: [],
        standings: [
          standingsRow(P, T, {
            place: null,
            playOffs: null,
            finalFour: null,
            final: 900_000,
          }),
        ],
        survival: [],
      }).map(({ atGame }) => atGame),
    ).toEqual([E]);
  });

  it('a survival row counts from the game its team played in its round', () => {
    expect(
      earnedPointsOf(season, {
        matches: [],
        standings: [],
        survival: [survivalRow(P, 40, T, 300)],
      }),
    ).toEqual([{ player: P, kind: 'survival', points: sp(30_000), atGame: D }]);
  });

  it('a pending survival row (no points) earns nothing; a pick without a game throws', () => {
    expect(
      earnedPointsOf(season, {
        matches: [],
        standings: [],
        survival: [survivalRow(P, 40, T, null)],
      }),
    ).toEqual([]);
    expect(() =>
      earnedPointsOf(season, {
        matches: [],
        standings: [],
        survival: [survivalRow(P, 39, T, 300)],
      }),
    ).toThrow('survival');
  });
});
