import { at } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { vilniusDateTime } from './vilnius-time';

// R-51: game times in Vilnius time, written in Lithuanian.

describe('vilniusDateTime', () => {
  it.each([
    ['2026-10-06T18:00:00Z', 'spalio 6 d., 21:00'],
    ['2027-01-15T17:30:00Z', 'sausio 15 d., 19:30'],
    ['2027-03-04T18:00:00Z', 'kovo 4 d., 20:00'],
    ['2026-10-25T00:30:00Z', 'spalio 25 d., 03:30'],
    ['2026-12-31T22:30:00Z', 'sausio 1 d., 00:30'],
  ] as const)('R-51: %s is %s', (instant, text) => {
    expect(vilniusDateTime(at(instant))).toBe(text);
  });
});
