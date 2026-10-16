import { describe, expect, it } from 'vitest';
import {
  centsToPoints,
  echoPoints,
  leaderPoints,
  numberFormat,
  onePlace,
  wholePoints,
} from './number-format';

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

  it('can leave the thousands ungrouped, as number_format($x, 1, ".", "")', () => {
    expect(onePlace(123456, { grouping: false })).toBe('1234.6');
    expect(onePlace(29550, { grouping: false })).toBe('295.5');
  });
});

// The three formats that read cents as points, each as it was printed before
// they moved here: different roundings, kept where they differ.

describe('centsToPoints', () => {
  it.each([
    [0, 0],
    [150, 1.5],
    [-250, -2.5],
    [7, 0.07],
  ] as const)('%i cents are %s points', (cents, points) => {
    expect(centsToPoints(cents)).toBe(points);
  });
});

describe('echoPoints (PHP`s echo of a float: unrounded)', () => {
  it.each([
    [0, '0'],
    [3, '3'],
    [1.5, '1.5'],
    [0.07, '0.07'],
    [-2.5, '-2.5'],
    [12.34, '12.34'],
  ] as const)('%s points print as %s', (points, text) => {
    expect(echoPoints(points)).toBe(text);
  });
});

describe('wholePoints (number_format($x, 0): half up, never a decimal)', () => {
  it.each([
    [0, '0'],
    [149, '1'],
    [150, '2'],
    [250, '3'],
    [-150, '-1'],
    [-151, '-2'],
    [123_450, '1,235'],
  ] as const)('%i cents print as %s', (cents, text) => {
    expect(wholePoints(cents)).toBe(text);
  });
});

describe('numberFormat without grouping (number_format($x, 2, ".", ""))', () => {
  it.each([
    [123456, 2, '1234.56'],
    [123456789, 0, '123456789'],
    [-123456, 2, '-1234.56'],
    [10, 2, '0.10'],
  ] as const)('%i units with %i places is %s', (units, places, text) => {
    expect(numberFormat(units, places, { grouping: false })).toBe(text);
  });

  it('groups by default and when asked', () => {
    expect(numberFormat(123456, 2)).toBe('1,234.56');
    expect(numberFormat(123456, 2, { grouping: true })).toBe('1,234.56');
  });
});
