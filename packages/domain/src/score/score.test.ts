import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { Rate, rateInvariant, Score, scoreSideInvariant } from './score';

describe('Score', () => {
  it('knows its margin and outcome', () => {
    const result = Score.of(70, 95);
    expect(result.ok && result.value.margin()).toBe(-25);
    expect(result.ok && result.value.outcome()).toBe('away');
  });

  it('allows a level value: refusing one is the caller rule', () => {
    const result = Score.of(81, 81);
    expect(result.ok && result.value.outcome()).toBe('level');
  });

  it.each([
    // R-41, under both sets: sportbet's UpdateResultRequest refuses it too.
    ['a negative score', Score.of(-1, 80), 'negative'],
    ['a fractional score', Score.of(80.5, 79), 'not-a-whole-number'],
  ] as const)('refuses %s', (_, result, refusal) => {
    expect(result).toEqual(refuse(refusal));
  });
});

describe('Rate', () => {
  it('accepts a positive whole number', () => {
    const result = Rate.of(2);
    expect(result.ok && result.value.value).toBe(2);
  });

  it.each([0, -1, 1.5])('refuses %s', (value) => {
    expect(Rate.of(value)).toEqual(refuse('not-a-positive-integer'));
  });
});

// The database CHECKs hold the same invariants (packages/db): the factory
// and the column must draw the line in the same place.
describe('the score and rate invariants', () => {
  it('Score.of accepts and refuses each side exactly as scoreSideInvariant does', () => {
    for (const { value } of scoreSideInvariant.accepts) {
      expect(Score.of(value, value).ok).toBe(true);
    }
    for (const { value } of scoreSideInvariant.refuses) {
      expect(Score.of(value, 0)).toEqual(refuse('negative'));
      expect(Score.of(0, value)).toEqual(refuse('negative'));
    }
  });

  it('Rate.of accepts and refuses exactly as rateInvariant does', () => {
    for (const { value } of rateInvariant.accepts) {
      expect(Rate.of(value).ok).toBe(true);
    }
    for (const { value } of rateInvariant.refuses) {
      expect(Rate.of(value)).toEqual(refuse('not-a-positive-integer'));
    }
  });
});
