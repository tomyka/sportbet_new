import { describe, expect, it } from 'vitest';
import { sportbetRules } from '../rules/rule-set';
import { at, gameNo, makeGame, roundNo, unwrap } from '../testing';
import {
  groupResultGames,
  resultBoxesOpen,
  resultsPageGames,
} from './results-page';

const NOW = at('2026-10-15T12:00:00Z');

/** A game between two teams; postponed before its tip-off when asked. */
const game = (spec: {
  readonly id: number;
  readonly round?: number;
  readonly tipOff: string;
  readonly result?: readonly [number, number];
  readonly postponed?: boolean;
}) => {
  const made = makeGame({
    id: spec.id,
    round: spec.round ?? 1,
    home: 'ZAL',
    away: 'OLY',
    tipOff: spec.tipOff,
    ...(spec.result === undefined ? {} : { result: spec.result }),
  });
  return spec.postponed === true
    ? unwrap(made.postpone(at('2026-10-01T12:00:00Z'), sportbetRules))
    : made;
};

describe('results pages (ResultController)', () => {
  it("results: the current round's games, or every game (R-66), by tip-off then id", () => {
    const games = [
      game({ id: 3, round: 2, tipOff: '2026-10-09T18:00:00Z' }),
      game({ id: 1, round: 1, tipOff: '2026-10-02T18:00:00Z' }),
      game({ id: 2, round: 1, tipOff: '2026-10-02T18:00:00Z' }),
    ];
    expect(resultsPageGames(games, roundNo(1)).map(({ id }) => id)).toEqual([
      gameNo(1),
      gameNo(2),
    ]);
    expect(resultsPageGames(games, 'all').map(({ id }) => id)).toEqual([
      gameNo(1),
      gameNo(2),
      gameNo(3),
    ]);
    expect(resultsPageGames(games, null)).toEqual([]);
  });

  it('results: the boxes take input once the game has tipped off, or while it is postponed (decision 10)', () => {
    expect(
      resultBoxesOpen(game({ id: 1, tipOff: '2026-10-20T18:00:00Z' }), NOW),
    ).toBe(false);
    expect(
      resultBoxesOpen(game({ id: 1, tipOff: '2026-10-02T18:00:00Z' }), NOW),
    ).toBe(true);
    expect(
      resultBoxesOpen(
        game({ id: 1, tipOff: '2026-10-20T18:00:00Z', postponed: true }),
        NOW,
      ),
    ).toBe(true);
  });

  it('results: a knockout round is grouped by Vilnius day, any other is one card (decision 5); a round with every game scored is finished', () => {
    const rounds = [
      { number: roundNo(1), knockout: false },
      { number: roundNo(2), knockout: true },
    ];
    const games = [
      game({
        id: 1,
        round: 1,
        tipOff: '2026-10-02T18:00:00Z',
        result: [88, 79],
      }),
      game({
        id: 2,
        round: 1,
        tipOff: '2026-10-03T18:00:00Z',
        result: [70, 75],
      }),
      game({ id: 3, round: 2, tipOff: '2026-10-09T18:00:00Z' }),
      game({ id: 4, round: 2, tipOff: '2026-10-10T18:00:00Z' }),
    ];
    const dayOf = (instant: number) =>
      new Date(instant).toISOString().slice(0, 10);
    expect(groupResultGames(games, rounds, dayOf)).toEqual([
      {
        round: roundNo(1),
        finished: true,
        cards: [{ day: null, games: [games[0], games[1]] }],
      },
      {
        round: roundNo(2),
        finished: false,
        cards: [
          { day: '2026-10-09', games: [games[2]] },
          { day: '2026-10-10', games: [games[3]] },
        ],
      },
    ]);
  });
});
