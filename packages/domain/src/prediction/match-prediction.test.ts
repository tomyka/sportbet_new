import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { at, gameNo, player, score, unwrap } from '../testing';
import { MatchPrediction, PREDICTION_ORIGINS } from './match-prediction';

const entry = (home: number | null, away: number | null) => ({
  player: player('ada'),
  game: gameNo(1),
  home,
  away,
});

describe('MS-1', () => {
  it('prediction: a level score is refused', () => {
    expect(MatchPrediction.enter(entry(85, 85))).toEqual(refuse('level'));
  });

  it('prediction: a score below 50 or above 120 is refused', () => {
    expect(MatchPrediction.enter(entry(49, 80))).toEqual(
      refuse('out-of-range'),
    );
    expect(MatchPrediction.enter(entry(121, 80))).toEqual(
      refuse('out-of-range'),
    );
    expect(MatchPrediction.enter(entry(50, 120)).ok).toBe(true);
  });

  it('prediction: two blanks are a valid unanswered prediction', () => {
    const blank = unwrap(MatchPrediction.enter(entry(null, null)));
    expect(blank.isAnswered()).toBe(false);
    expect(blank.outcome).toBeNull();
  });

  it('prediction: a half-typed prediction is refused (R-15, sportbet#287)', () => {
    expect(MatchPrediction.enter(entry(85, null))).toEqual(
      refuse('half-typed'),
    );
    expect(MatchPrediction.enter(entry(null, 80))).toEqual(
      refuse('half-typed'),
    );
  });

  it('prediction: a fractional score is refused', () => {
    expect(MatchPrediction.enter(entry(85.5, 80))).toEqual(
      refuse('not-a-whole-number'),
    );
  });
});

describe('PREDICTION_ORIGINS', () => {
  it('lists a real prediction, a fill-in and a late fill-in (FI-1, R-9)', () => {
    expect(PREDICTION_ORIGINS).toEqual(['real', 'fill-in', 'late-fill-in']);
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

describe('MatchPrediction.stored: a stored row read back', () => {
  const base = { player: player('ada'), game: gameNo(1) };

  it('prediction: a sportbet fill-in has no fill-in time', () => {
    const stored = unwrap(
      MatchPrediction.stored({
        ...base,
        home: 82,
        away: 76,
        origin: 'fill-in',
        filledInAt: null,
      }),
    );
    expect(stored.origin).toBe('fill-in');
    expect(stored.filledInAt).toBeNull();
    expect(stored.outcome).toBe('home');
  });

  it('prediction: a stored row keeps what entry would refuse today', () => {
    // A half-typed row (sportbet stored them until sportbet#287) and a side
    // outside 50-120.
    const half = unwrap(
      MatchPrediction.stored({
        ...base,
        home: null,
        away: 80,
        origin: 'real',
        filledInAt: null,
      }),
    );
    expect(half.isAnswered()).toBe(false);
    expect(half.hasBlankHomeScore()).toBe(true);
    expect(
      MatchPrediction.stored({
        ...base,
        home: 130,
        away: 40,
        origin: 'real',
        filledInAt: null,
      }).ok,
    ).toBe(true);
  });

  it.each([
    ['a negative side', { home: -1, away: 80 }, 'real', 'negative'],
    [
      'a fractional side',
      { home: 80.5, away: 70 },
      'real',
      'not-a-whole-number',
    ],
    ['a level score', { home: 80, away: 80 }, 'real', 'level'],
    [
      'a fill-in without both scores',
      { home: 80, away: null },
      'fill-in',
      'fill-in-without-score',
    ],
  ] as const)('prediction: refuses %s', (_, sides, origin, refusal) => {
    expect(
      MatchPrediction.stored({
        ...base,
        ...sides,
        origin,
        filledInAt: null,
      }),
    ).toEqual(refuse(refusal));
  });

  it('prediction: refuses a real prediction with a fill-in time', () => {
    expect(
      MatchPrediction.stored({
        ...base,
        home: 80,
        away: 70,
        origin: 'real',
        filledInAt: at('2026-10-02T20:00:00Z'),
      }),
    ).toEqual(refuse('real-with-fill-in-time'));
  });
});
