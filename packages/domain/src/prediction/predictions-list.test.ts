import { describe, expect, it } from 'vitest';
import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
import { Game } from '../round/game';
import { Season } from '../round/season';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import {
  at,
  gameNo,
  makeGame,
  makeRound,
  player,
  rate,
  roundNo,
  team,
  unwrap,
} from '../testing';
import { MatchPrediction } from './match-prediction';
import {
  groupPredictionLines,
  missingResultPredictions,
  oddsPanel,
  predictionRowState,
  predictionsRound,
} from './predictions-list';

const JONAS = player('1');
const NOW = at('2026-10-15T12:00:00Z');

// Round 1: game 7 scored, game 9 past its tip-off unscored, game 10 still
// open. Round 2: game 11 open.
const G7 = makeGame({
  id: 7,
  round: 1,
  home: '11',
  away: '12',
  tipOff: '2026-10-02T18:00:00Z',
  result: [88, 79],
});
const G9 = makeGame({
  id: 9,
  round: 1,
  home: '13',
  away: '14',
  tipOff: '2026-10-10T17:30:00Z',
});
const G10 = makeGame({
  id: 10,
  round: 1,
  home: '12',
  away: '11',
  tipOff: '2026-10-20T18:00:00Z',
});
const G11 = makeGame({
  id: 11,
  round: 2,
  home: '14',
  away: '13',
  tipOff: '2026-10-27T18:00:00Z',
});
const SEASON = unwrap(
  Season.create({
    rounds: [makeRound({ number: 1 }), makeRound({ number: 2 })],
    games: [G7, G9, G10, G11],
    endsAt: null,
  }),
);

const row = (game: number, home: number | null, away: number | null) =>
  unwrap(
    MatchPrediction.enter({ player: JONAS, game: gameNo(game), home, away }),
  );

const storedGame = (
  id: number,
  lockedSince: string | null,
  postponed: boolean,
) =>
  unwrap(
    Game.stored({
      id: gameNo(id),
      round: roundNo(1),
      home: team('11'),
      away: team('13'),
      tipOff: at('2026-10-30T18:00:00Z'),
      result: null,
      recordedWinner: null,
      lockedSince: lockedSince === null ? null : at(lockedSince),
      postponed,
    }),
  );

describe('predictionRowState (GameLock::rowIsClosed)', () => {
  it('list: a scored game is scored, a started one locked, one still to come open', () => {
    expect(predictionRowState(G7, NOW)).toBe('scored');
    expect(predictionRowState(G9, NOW)).toBe('locked');
    expect(predictionRowState(G10, NOW)).toBe('open');
  });

  it('list (R-13, R-41): a game locked after a move, or postponed, is locked', () => {
    expect(
      predictionRowState(storedGame(12, '2026-10-01T18:00:00Z', false), NOW),
    ).toBe('locked');
    expect(predictionRowState(storedGame(13, null, true), NOW)).toBe('locked');
  });
});

describe('predictionsRound (getPredictionResultsUser)', () => {
  const rounds = [
    { id: 21, number: roundNo(1) },
    { id: 22, number: roundNo(2) },
  ];

  it('list: no ?event, or one that is not a whole number, or 0, is the current round', () => {
    for (const requested of [null, '', 'abc', '0', '-3']) {
      expect(
        predictionsRound({ requested, rounds, current: roundNo(2) }),
      ).toEqual({ kind: 'round', round: roundNo(2) });
    }
  });

  it('list: with no current round, every round', () => {
    expect(
      predictionsRound({ requested: null, rounds, current: null }),
    ).toEqual({ kind: 'all' });
  });

  it("list: ?event names a round by its id; one the tournament does not have shows none, as sportbet's filter finds no row", () => {
    expect(
      predictionsRound({ requested: '21', rounds, current: roundNo(2) }),
    ).toEqual({ kind: 'round', round: roundNo(1) });
    expect(
      predictionsRound({ requested: '99', rounds, current: roundNo(2) }),
    ).toEqual({ kind: 'none' });
  });

  it('list (R-58): ?event=all is every round', () => {
    expect(
      predictionsRound({ requested: 'all', rounds, current: roundNo(1) }),
    ).toEqual({ kind: 'all' });
  });
});

describe('groupPredictionLines', () => {
  const line = (game: number, round: number, tipOff: string) => ({
    game: gameNo(game),
    round: roundNo(round),
    tipOff: at(tipOff),
  });
  const dayOf = (instant: number) =>
    new Date(instant).toISOString().slice(0, 10);

  it('list: by round, then by day in order, then by tip-off, ties by game', () => {
    const groups = groupPredictionLines(
      [
        line(11, 2, '2026-10-27T18:00:00Z'),
        line(10, 1, '2026-10-20T18:00:00Z'),
        line(8, 1, '2026-10-02T18:00:00Z'),
        line(7, 1, '2026-10-02T18:00:00Z'),
        line(9, 1, '2026-10-02T16:00:00Z'),
      ],
      dayOf,
    );
    expect(
      groups.map((group) => ({
        round: group.round,
        days: group.days.map((day) => ({
          day: day.day,
          games: day.lines.map((each) => each.game),
        })),
      })),
    ).toEqual([
      {
        round: 1,
        days: [
          { day: '2026-10-02', games: [9, 7, 8] },
          { day: '2026-10-20', games: [10] },
        ],
      },
      { round: 2, days: [{ day: '2026-10-27', games: [11] }] },
    ]);
  });

  it('list: nothing to show is no group', () => {
    expect(groupPredictionLines([], dayOf)).toEqual([]);
  });
});

describe('oddsPanel (results.blade.php)', () => {
  it('list: each outcome at its odds and the round rate', () => {
    const odds = CrowdOdds.stored(
      unwrap(Odds.ofHundredths(59)),
      unwrap(Odds.ofHundredths(132)),
      unwrap(Odds.ofHundredths(232)),
    );
    const panel = oddsPanel(odds, rate(2));
    expect(panel.home.hundredths).toBe(15900);
    expect(panel.away.hundredths).toBe(23200);
    expect(panel.draw.hundredths).toBe(33200);
  });
});

describe('missingResultPredictions (MissingPredictions::openGamesWithoutAPrediction)', () => {
  it("badge: the current round's open games whose row lacks a score, under both sets", () => {
    const predictions = [
      row(7, null, null),
      row(9, null, null),
      row(10, null, null),
      row(11, null, null),
    ];
    // Both sets make round 1 current here (sportbet: its earliest unscored
    // game, 9; ruled: its soonest open game, 10). Game 10 is its only open game.
    for (const rules of [sportbetRules, ruledRules]) {
      expect(
        missingResultPredictions({
          season: SEASON,
          current: SEASON.currentRound(NOW, rules),
          predictions,
          now: NOW,
        }),
      ).toBe(1);
    }
  });

  it('badge: an answered game, a game with no row, and no current round count nothing', () => {
    expect(
      missingResultPredictions({
        season: SEASON,
        current: roundNo(1),
        predictions: [row(10, 88, 79)],
        now: NOW,
      }),
    ).toBe(0);
    expect(
      missingResultPredictions({
        season: SEASON,
        current: roundNo(1),
        predictions: [],
        now: NOW,
      }),
    ).toBe(0);
    expect(
      missingResultPredictions({
        season: SEASON,
        current: null,
        predictions: [row(10, null, null)],
        now: NOW,
      }),
    ).toBe(0);
  });
});
