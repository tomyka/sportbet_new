import { describe, expect, it } from 'vitest';
import { factsProblem } from './facts-check';

describe('factsProblem (R-92, before the facts form is sent)', () => {
  it('a complete table, final or not, has no problem, in any order', () => {
    expect(factsProblem(['1', '2', '3'], true)).toBeNull();
    expect(factsProblem(['3', '1', '2'], true)).toBeNull();
    expect(factsProblem(['3', '1', '2'], false)).toBeNull();
  });

  it('a table not marked final may be partly filled', () => {
    expect(factsProblem(['1', '', '3'], false)).toBeNull();
    expect(factsProblem(['', '', ''], false)).toBeNull();
  });

  it('final with a gap, a missing place or a place past N is incomplete', () => {
    expect(factsProblem(['1', '', '3'], true)).toBe('places-incomplete');
    expect(factsProblem(['1', '2', '4'], true)).toBe('places-incomplete');
    expect(factsProblem(['1', '2', '5'], true)).toBe('places-incomplete');
    expect(factsProblem(['', '', ''], true)).toBe('places-incomplete');
  });

  it('two teams at one place is refused, final or not, and places are compared as numbers', () => {
    expect(factsProblem(['1', '1', ''], false)).toBe('duplicate-place');
    expect(factsProblem(['1', '01', '3'], true)).toBe('duplicate-place');
  });

  it('a duplicate is named before an incompleteness', () => {
    expect(factsProblem(['2', '2', ''], true)).toBe('duplicate-place');
  });
});
