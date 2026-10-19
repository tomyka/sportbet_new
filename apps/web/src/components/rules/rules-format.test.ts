import { describe, expect, it } from 'vitest';
import {
  missCostWords,
  missTerm,
  oddsText,
  plain,
  pointsText,
  winnerPointsText,
} from './rules-format';

describe('rules-format', () => {
  it('missTerm (R-138): |Δ| at slope 1, 2×|Δ| at slope 2', () => {
    expect(missTerm(1)).toBe('|Δ|');
    expect(missTerm(2)).toBe('2×|Δ|');
  });

  it('missCostWords (R-138): tiek, dvigubai tiek, and a counted form beyond', () => {
    expect(missCostWords(1)).toBe('tiek');
    expect(missCostWords(2)).toBe('dvigubai tiek');
    expect(missCostWords(3)).toBe('3× tiek');
  });

  it('plain writes a whole point value', () => {
    expect(plain(50)).toBe('50');
  });

  it.each([
    [0, '0'],
    [500, '5'],
    [5_000, '50'],
    [10_000, '100'],
    [1_250, '12.5'],
    [4_605, '46.05'],
    [-1_400, '−14'],
    [-50, '−0.5'],
    [123_400, '1234'],
  ] as const)(
    'pointsText: %i hundredths read %s (no trailing zeros, a real minus)',
    (hundredths, text) => {
      expect(pointsText(hundredths)).toBe(text);
    },
  );

  it('oddsText keeps two places and never groups', () => {
    expect(oddsText(10)).toBe('0.10');
    expect(oddsText(100)).toBe('1.00');
    expect(oddsText(123_456)).toBe('1234.56');
  });

  it('winnerPointsText keeps one place and never groups', () => {
    expect(winnerPointsText(5_500)).toBe('55.0');
    expect(winnerPointsText(12_950)).toBe('129.5');
    expect(winnerPointsText(123_456)).toBe('1234.6');
  });
});
