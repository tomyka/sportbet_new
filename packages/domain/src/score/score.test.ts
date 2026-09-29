import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { Rate, Score } from './score';

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
