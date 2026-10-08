import { describe, expect, it } from 'vitest';
import { announcement, moved } from './ladder-moves';

describe('moved', () => {
  const order = ['a', 'b', 'c', 'd'] as const;

  it('up and down by one', () => {
    expect(moved(order, 2, 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moved(order, 1, 2)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('to the top and to the bottom', () => {
    expect(moved(order, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moved(order, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('to its own place: unchanged, and the input is never touched', () => {
    expect(moved(order, 1, 1)).toEqual(['a', 'b', 'c', 'd']);
    const input = ['a', 'b'];
    moved(input, 0, 1);
    expect(input).toEqual(['a', 'b']);
  });
});

describe('announcement (psAnnounce)', () => {
  it('":team - :position vieta iš :total"', () => {
    expect(announcement('Olympiacos', 2, 3)).toBe('Olympiacos - 2 vieta iš 3');
  });
});
