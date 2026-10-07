import { describe, expect, it } from 'vitest';
import { MatchPrediction } from '../prediction/match-prediction';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { tournamentId } from '../shared/ids';
import {
  at,
  gameNo,
  player,
  score,
  makeGame,
  scriptedDice,
  unwrap,
} from '../testing';
import {
  enterResult,
  mistakenFillInsRemoved,
  resultFillIns,
} from './enter-result';

const NOW = at('2026-10-15T12:00:00Z');
const T = unwrap(tournamentId('3'));
const game = (id: number, tipOff: string) =>
  makeGame({ id, round: 1, home: 'ZAL', away: 'OLY', tipOff });
const STARTED = game(11, '2026-10-12T18:00:00Z');
const FUTURE = game(12, '2026-10-20T18:00:00Z');

describe('enterResult (UpdateResultRequest::after, ResultController::updateResult)', () => {
  it('result: a score on a started game', () => {
    const entered = enterResult({
      game: STARTED,
      entry: { kind: 'score', score: score(88, 79) },
      now: NOW,
      rules: ruledRules,
    });
    expect(entered.ok && entered.value.game.result).toEqual(score(88, 79));
    expect(entered.ok && entered.value.scored).toBe(true);
  });

  it('result: not before tip-off', () => {
    expect(
      enterResult({
        game: FUTURE,
        entry: { kind: 'score', score: score(88, 79) },
        now: NOW,
        rules: ruledRules,
      }),
    ).toEqual({ ok: false, refusal: 'not-started' });
  });

  it('result (R-38): a level score is refused', () => {
    expect(
      enterResult({
        game: STARTED,
        entry: { kind: 'score', score: score(80, 80) },
        now: NOW,
        rules: ruledRules,
      }),
    ).toEqual({ ok: false, refusal: 'level' });
  });

  it('result (R-63): -1 : -1 postpones whatever the clock; a scored game is cleared first (decision 8)', () => {
    const future = enterResult({
      game: FUTURE,
      entry: { kind: 'postpone' },
      now: NOW,
      rules: ruledRules,
    });
    expect(future.ok && future.value.game.postponed).toBe(true);
    const scored = unwrap(STARTED.withResult(score(88, 79)));
    const postponed = enterResult({
      game: scored,
      entry: { kind: 'postpone' },
      now: NOW,
      rules: ruledRules,
    });
    expect(postponed.ok && postponed.value.game.result).toBeNull();
    expect(postponed.ok && postponed.value.game.postponed).toBe(true);
    expect(postponed.ok && postponed.value.corrected).toBe(true);
  });

  it('result (R-63): clearing a postponed game ends the postponement (decision 9)', () => {
    const postponed = unwrap(FUTURE.postpone(NOW, ruledRules));
    const cleared = enterResult({
      game: postponed,
      entry: { kind: 'clear' },
      now: NOW,
      rules: ruledRules,
    });
    expect(cleared.ok && cleared.value.game.postponed).toBe(false);
    expect(cleared.ok && cleared.value.scored).toBe(false);
  });

  it.each([sportbetRules, ruledRules])(
    'result ($name, R-70): a postponed game is scored once its original tip-off has passed - the postponement ends',
    (rules) => {
      const postponed = unwrap(FUTURE.postpone(NOW, rules));
      const entered = enterResult({
        game: postponed,
        entry: { kind: 'score', score: score(88, 79) },
        now: at('2026-10-21T12:00:00Z'),
        rules,
      });
      expect(entered.ok && entered.value.game.result).toEqual(score(88, 79));
      expect(entered.ok && entered.value.game.postponed).toBe(false);
      expect(entered.ok && entered.value.scored).toBe(true);
    },
  );

  it.each([sportbetRules, ruledRules])(
    'result ($name, R-70): before its original tip-off a postponed game is not started',
    (rules) => {
      const postponed = unwrap(FUTURE.postpone(NOW, rules));
      expect(
        enterResult({
          game: postponed,
          entry: { kind: 'score', score: score(88, 79) },
          now: NOW,
          rules,
        }),
      ).toEqual({ ok: false, refusal: 'not-started' });
    },
  );

  it('result: clearing a scored game is a correction', () => {
    const scored = unwrap(STARTED.withResult(score(88, 79)));
    const cleared = enterResult({
      game: scored,
      entry: { kind: 'clear' },
      now: NOW,
      rules: ruledRules,
    });
    expect(cleared.ok && cleared.value.game.result).toBeNull();
    expect(cleared.ok && cleared.value.corrected).toBe(true);
  });
});

describe('resultFillIns (GeneratedPredictions::fillFor, FI-1, R-7, R-32, R-39)', () => {
  const blank = (id: string) =>
    unwrap(
      MatchPrediction.stored({
        player: player(id),
        game: gameNo(11),
        home: null,
        away: null,
        origin: 'real',
        filledInAt: null,
      }),
    );
  const row = (fillIns: number, switchedOff = false, adminHidden = false) => [
    { tournament: T, switchedOff, adminHidden, fillIns },
  ];

  it('fill-ins: a blank row gets one and its count goes up; a switched-off player gets none (R-32); a hidden one does (R-39)', () => {
    const made = resultFillIns({
      game: STARTED,
      tournament: T,
      candidates: [
        { prediction: blank('1'), statuses: row(0) },
        { prediction: blank('2'), statuses: row(20, true) },
        { prediction: blank('3'), statuses: row(3, false, true) },
      ],
      dice: scriptedDice([10, 10, 10, 5, 5, 5, 0, 0, 0, 1, 1, 1]),
      madeAt: NOW,
      rules: ruledRules,
    });
    expect(made.map(({ prediction }) => prediction.player)).toEqual([
      player('1'),
      player('3'),
    ]);
    expect(made[0]?.prediction.home).toBe(85);
    expect(made[0]?.prediction.away).toBe(70);
    expect(made[0]?.statuses).toEqual(row(1));
    expect(made[1]?.statuses).toEqual(row(4, false, true));
  });

  it('fill-ins (R-7): the 20th switches the player off in that tournament', () => {
    const [made] = resultFillIns({
      game: STARTED,
      tournament: T,
      candidates: [{ prediction: blank('1'), statuses: row(19) }],
      dice: scriptedDice([0, 0, 0, 1, 1, 1]),
      madeAt: NOW,
      rules: ruledRules,
    });
    expect(made?.statuses).toEqual(row(20, true));
  });

  it('fill-ins (sportbet): the 5th over a lifetime switches the player off', () => {
    const [made] = resultFillIns({
      game: STARTED,
      tournament: T,
      candidates: [{ prediction: blank('1'), statuses: row(4) }],
      dice: scriptedDice([0, 0, 0, 1, 1, 1]),
      madeAt: NOW,
      rules: sportbetRules,
    });
    expect(made?.statuses).toEqual(row(5, true));
  });
});

describe('mistakenFillInsRemoved (FI-4, R-5)', () => {
  const fillIn = (madeAt: string) =>
    MatchPrediction.fillIn(
      player('1'),
      gameNo(11),
      score(80, 70),
      'fill-in',
      at(madeAt),
    );

  it('correction (ruled): a fill-in made before the tip-off is cleared and uncounted', () => {
    const removed = mistakenFillInsRemoved({
      game: STARTED,
      tournament: T,
      candidates: [
        {
          prediction: fillIn('2026-10-11T00:00:00Z'),
          statuses: [
            {
              tournament: T,
              switchedOff: true,
              adminHidden: false,
              fillIns: 20,
            },
          ],
        },
      ],
      rules: ruledRules,
    });
    expect(removed[0]?.prediction.hasBlankHomeScore()).toBe(true);
    expect(removed[0]?.statuses).toEqual([
      { tournament: T, switchedOff: false, adminHidden: false, fillIns: 19 },
    ]);
  });

  it('correction (sportbet): every fill-in stays', () => {
    expect(
      mistakenFillInsRemoved({
        game: STARTED,
        tournament: T,
        candidates: [
          {
            prediction: fillIn('2026-10-11T00:00:00Z'),
            statuses: [
              {
                tournament: T,
                switchedOff: false,
                adminHidden: false,
                fillIns: 1,
              },
            ],
          },
        ],
        rules: sportbetRules,
      }),
    ).toEqual([]);
  });
});
