import { describe, expect, it } from 'vitest';
import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
import { MatchPrediction } from '../prediction/match-prediction';
import type { MatchPoints } from '../prediction/match-scoring';
import { sportbetRules } from '../rules/rule-set';
import { secondsAfter } from '../shared/instant';
import {
  at,
  gameNo,
  makeGame,
  makeRound,
  player,
  rate,
  score,
} from '../testing';
import { walkSerija, type SerijaGame } from './serija';

const odds = CrowdOdds.stored(
  Odds.ofHundredths(59),
  Odds.ofHundredths(159),
  Odds.ofHundredths(259),
);

/** ada's points on a game Zalgiris won 88-79, from her prediction. */
function pointsFor(prediction: MatchPrediction): MatchPoints {
  const game = makeGame({
    id: prediction.game,
    round: 1,
    home: 'ZAL',
    away: 'OLY',
    tipOff: '2026-10-02T18:00:00Z',
    result: [88, 79],
  });
  const points = prediction.score(
    game,
    makeRound({ number: 1 }),
    odds,
    sportbetRules,
  );
  if (points === null) throw new Error('expected a points row');
  return points;
}

const real = (id: number, home: number, away: number) =>
  pointsFor(realPrediction(id, home, away));

function realPrediction(
  id: number,
  home: number,
  away: number,
): MatchPrediction {
  const entered = MatchPrediction.enter(
    { player: player('ada'), game: gameNo(id), home, away },
    sportbetRules,
  );
  if (!entered.ok) throw new Error(entered.refusal);
  return entered.value;
}

const right = (id: number) => real(id, 85, 80);
const wrong = (id: number) => real(id, 79, 88);
const filledIn = (id: number) =>
  pointsFor(
    MatchPrediction.fillIn(
      player('ada'),
      gameNo(id),
      score(82, 76),
      'fill-in',
      at('2026-10-02T20:00:00Z'),
    ),
  );

// By default game n tips off n days after the season opens.
const OPENING = at('2026-10-01T18:00:00Z');
const game = (
  id: number,
  points: MatchPoints | null,
  options: { tournament?: string; rate?: number; tipOff?: string } = {},
): SerijaGame => ({
  tournament: options.tournament ?? 'euroleague-2026-27',
  game: gameNo(id),
  tipOff:
    options.tipOff === undefined
      ? secondsAfter(OPENING, id * 86_400)
      : at(options.tipOff),
  rate: rate(options.rate ?? 1),
  points,
});

const stored = (games: readonly SerijaGame[]) =>
  Object.fromEntries(
    walkSerija(games).map(({ game: id, bonus }) => [id, bonus.toString()]),
  );

describe('SE-1', () => {
  it('serija: a real right-winner call extends the run', () => {
    expect(stored([game(1, right(1)), game(2, right(2))])).toEqual({
      1: '0.00',
      2: '10.00',
    });
  });

  it('serija: a fill-in ends the run', () => {
    // The fill-in named the winner and earned 50, but a fill-in never counts.
    expect(filledIn(2).winner.toString()).toBe('50.00');
    expect(
      stored([game(1, right(1)), game(2, filledIn(2)), game(3, right(3))]),
    ).toEqual({
      1: '0.00',
      2: '0.00',
      3: '0.00',
    });
  });

  it('serija: a negative margin does not end the run', () => {
    // 120-50 on 88-79: the right winner, margin 50 - |70 - 9| = -11.
    const lopsided = real(2, 120, 50);
    expect(lopsided.margin.toString()).toBe('-11.00');
    expect(stored([game(1, right(1)), game(2, lopsided)])).toEqual({
      1: '0.00',
      2: '10.00',
    });
  });
});

describe('SE-2', () => {
  it('serija: games are walked in tip-off order', () => {
    // A round-8 game postponed to 12-10 is walked at 12-10, between round
    // 15's games, whatever order the games arrive in.
    const games = [
      game(80, wrong(80), { tipOff: '2026-12-10T18:00:00Z' }),
      game(150, right(150), { tipOff: '2026-12-09T18:00:00Z' }),
      game(151, right(151), { tipOff: '2026-12-11T18:00:00Z' }),
      game(79, right(79), { tipOff: '2026-11-13T18:00:00Z' }),
    ];
    expect(stored(games)).toEqual({
      79: '0.00',
      150: '10.00',
      80: '0.00',
      151: '0.00',
    });
  });

  it('serija: games at the same tip-off are walked by id', () => {
    const tipOff = '2026-12-10T18:00:00Z';
    expect(
      stored([game(2, right(2), { tipOff }), game(1, right(1), { tipOff })]),
    ).toEqual({
      1: '0.00',
      2: '10.00',
    });
  });

  it('serija: a game with no points row ends the run', () => {
    // No row: the player was switched off and not filled in.
    expect(
      stored([game(1, right(1)), game(2, null), game(3, right(3))]),
    ).toEqual({
      1: '0.00',
      3: '0.00',
    });
  });

  it('serija: a run does not carry across tournaments', () => {
    const games = [
      game(1, right(1), {
        tournament: 'euro-2026',
        tipOff: '2026-06-20T18:00:00Z',
      }),
      game(2, right(2), {
        tournament: 'euro-2026',
        tipOff: '2026-06-21T18:00:00Z',
      }),
      game(3, right(3), {
        tournament: 'euroleague-2026-27',
        tipOff: '2026-06-22T18:00:00Z',
      }),
      game(4, right(4), {
        tournament: 'euro-2026',
        tipOff: '2026-06-23T18:00:00Z',
      }),
    ];
    expect(stored(games)).toEqual({
      1: '0.00',
      2: '10.00',
      3: '0.00',
      4: '20.00',
    });
  });
});

describe('SE-3', () => {
  it('serija: the first call of a run adds nothing', () => {
    expect(stored([game(1, right(1), { rate: 3 })])).toEqual({ 1: '0.00' });
  });

  it('serija: each later call adds 10 x its rate', () => {
    // Four in a row, the fourth a rate-2 play-off: 0, 10, 20, 60 = 90.
    const bonuses = walkSerija([
      game(1, right(1)),
      game(2, right(2)),
      game(3, right(3)),
      game(4, right(4), { rate: 2 }),
    ]);
    expect(bonuses.map(({ bonus }) => bonus.toString())).toEqual([
      '0.00',
      '10.00',
      '20.00',
      '60.00',
    ]);
    expect(bonuses.reduce((sum, { bonus }) => sum + bonus.hundredths, 0)).toBe(
      9000,
    );
  });
});
