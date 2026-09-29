import { describe, expect, it } from 'vitest';
import { Odds, StandingsOdds } from './odds';
import { Points } from './points';
import { StandingsPoints } from './standings-points';

describe('Points', () => {
  it('adds and multiplies exactly', () => {
    const winner = Points.ofHundredths(7950);
    expect(winner.plus(Points.whole(46)).toString()).toBe('125.50');
    expect(winner.times(2).toString()).toBe('159.00');
  });

  it('prints a negative value with two decimals', () => {
    expect(Points.whole(-45).toString()).toBe('-45.00');
  });

  it('knows a whole or half value', () => {
    expect(Points.ofHundredths(7950).isMultipleOfHalf()).toBe(true);
    expect(Points.ofHundredths(8975).isMultipleOfHalf()).toBe(false);
  });

  it.each([
    ['a fraction of a hundredth', () => Points.ofHundredths(0.5)],
    ['a fractional factor', () => Points.whole(1).times(1.5)],
    ['an unsafe integer', () => Points.ofHundredths(2 ** 53)],
  ])('throws on %s', (_, make) => {
    expect(make).toThrow(/Points/);
  });

  it('is immutable', () => {
    expect(Object.isFrozen(Points.whole(1))).toBe(true);
  });
});

describe('StandingsPoints', () => {
  it('keeps four decimals and rounds to the cent half away from zero', () => {
    expect(StandingsPoints.ofTenThousandths(6_311_610).toString()).toBe(
      '631.1610',
    );
    expect(StandingsPoints.ofTenThousandths(6_311_610).toCents()).toBe(63_116);
    expect(StandingsPoints.ofTenThousandths(6_311_650).toCents()).toBe(63_117);
    expect(StandingsPoints.ofTenThousandths(-6_311_650).toCents()).toBe(
      -63_117,
    );
  });
});

describe('Odds', () => {
  it('prints two places, and standings odds four', () => {
    expect(Odds.ofHundredths(59).toString()).toBe('0.59');
    expect(Odds.ONE.toString()).toBe('1.00');
    expect(StandingsOdds.ofTenThousandths(23_219).toString()).toBe('2.3219');
  });

  it('refuses negative odds', () => {
    expect(() => Odds.ofHundredths(-1)).toThrow(/negative/);
    expect(() => StandingsOdds.ofTenThousandths(-1)).toThrow(/negative/);
  });
});
