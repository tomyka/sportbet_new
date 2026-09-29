import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { refuse } from '../shared/result';
import { at, gameNo, player, score, unwrap } from '../testing';
import { MatchPrediction } from './match-prediction';

const entry = (home: number | null, away: number | null) => ({
  player: player('ada'),
  game: gameNo(1),
  home,
  away,
});
const bothSets = [
  ['sportbet', sportbetRules],
  ['ruled', ruledRules],
] as const;

describe('MS-1', () => {
  it.each(bothSets)('prediction: a level score is refused (%s)', (_, rules) => {
    expect(MatchPrediction.enter(entry(85, 85), rules)).toEqual(
      refuse('level'),
    );
  });

  it.each(bothSets)(
    'prediction: a score below 50 or above 120 is refused (%s)',
    (_, rules) => {
      expect(MatchPrediction.enter(entry(49, 80), rules)).toEqual(
        refuse('out-of-range'),
      );
      expect(MatchPrediction.enter(entry(121, 80), rules)).toEqual(
        refuse('out-of-range'),
      );
      expect(MatchPrediction.enter(entry(50, 120), rules).ok).toBe(true);
    },
  );

  it.each(bothSets)(
    'prediction: two blanks are a valid unanswered prediction (%s)',
    (_, rules) => {
      const blank = unwrap(MatchPrediction.enter(entry(null, null), rules));
      expect(blank.isAnswered()).toBe(false);
      expect(blank.outcome).toBeNull();
    },
  );

  it('prediction (ruled): a half-typed prediction is refused', () => {
    expect(MatchPrediction.enter(entry(85, null), ruledRules)).toEqual(
      refuse('half-typed'),
    );
    expect(MatchPrediction.enter(entry(null, 80), ruledRules)).toEqual(
      refuse('half-typed'),
    );
  });

  it('prediction (sportbet): a half-typed prediction is stored', () => {
    const half = unwrap(MatchPrediction.enter(entry(85, null), sportbetRules));
    expect(half.home).toBe(85);
    expect(half.isAnswered()).toBe(false);
  });

  it('prediction: a fractional score is refused', () => {
    expect(MatchPrediction.enter(entry(85.5, 80), ruledRules)).toEqual(
      refuse('not-a-whole-number'),
    );
  });
});

describe('MatchPrediction.fillIn', () => {
  it('records its origin and when it was made', () => {
    const madeAt = at('2026-10-02T20:00:00Z');
    const fillIn = MatchPrediction.fillIn(
      player('ada'),
      gameNo(1),
      score(82, 76),
      'fill-in',
      madeAt,
    );
    expect(fillIn.origin).toBe('fill-in');
    expect(fillIn.filledInAt).toBe(madeAt);
    expect(fillIn.outcome).toBe('home');
    expect(fillIn.cleared().isAnswered()).toBe(false);
  });

  it('throws on a level score, which the generator never draws', () => {
    expect(() =>
      MatchPrediction.fillIn(
        player('ada'),
        gameNo(1),
        score(80, 80),
        'fill-in',
        at('2026-10-02T20:00:00Z'),
      ),
    ).toThrow(/never level/);
  });
});
