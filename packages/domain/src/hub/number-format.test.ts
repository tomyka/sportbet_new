import { describe, expect, it } from 'vitest';
import { leaderPoints, numberFormat, onePlace } from './number-format';

// PHP's number_format, as sportbet prints points ("12.5 pt") and counts
// ("1,234 prognozės").

describe('numberFormat', () => {
  it.each([
    [0, 0, '0'],
    [999, 0, '999'],
    [1234, 0, '1,234'],
    [1234567, 0, '1,234,567'],
    [125, 1, '12.5'],
    [123450, 1, '12,345.0'],
    [-125, 1, '-12.5'],
    [5, 1, '0.5'],
  ] as const)(
    'number format: %i units with %i places is %s',
    (units, places, text) => {
      expect(numberFormat(units, places)).toBe(text);
    },
  );
});

describe('leaderPoints', () => {
  it.each([
    [1234, '12.3'],
    [1235, '12.4'],
    [-1235, '-12.4'],
    [123456, '1,234.6'],
  ] as const)(
    'leaders: a total of %i cents shows as %s (ROUND(..., 1), half away from zero)',
    (cents, text) => {
      expect(leaderPoints(cents)).toBe(text);
    },
  );
});

describe('onePlace', () => {
  it("points to one decimal, as sportbet's number_format(round(x, 1), 1) prints them", () => {
    expect(onePlace(7950)).toBe('79.5');
    expect(onePlace(15900)).toBe('159.0');
    expect(onePlace(0)).toBe('0.0');
    expect(onePlace(-4500)).toBe('-45.0');
    expect(onePlace(123456)).toBe('1,234.6');
  });
});
