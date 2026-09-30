import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { unwrap } from '../testing';
import { decimalUnits } from './fixed-point';
import { Odds, oddsInvariant, oddsOfHundredths, StandingsOdds } from './odds';
import { Points, pointsOfHundredths, pointsWhole } from './points';
import {
  StandingsPoints,
  standingsPointsOfTenThousandths,
} from './standings-points';

describe('Points', () => {
  it('adds and multiplies exactly', () => {
    const winner = unwrap(Points.ofHundredths(7950));
    expect(winner.plus(unwrap(Points.whole(46))).toString()).toBe('125.50');
    expect(winner.times(2).toString()).toBe('159.00');
  });

  it('prints a negative value with two decimals', () => {
    expect(unwrap(Points.whole(-45)).toString()).toBe('-45.00');
  });

  it('knows a whole or half value', () => {
    expect(unwrap(Points.ofHundredths(7950)).isMultipleOfHalf()).toBe(true);
    expect(unwrap(Points.ofHundredths(8975)).isMultipleOfHalf()).toBe(false);
  });

  it.each([
    ['a fraction of a hundredth', Points.ofHundredths(0.5)],
    ['an unsafe integer', Points.ofHundredths(2 ** 53)],
    ['a fractional whole', Points.whole(1.5)],
    ['a whole too large to hold in hundredths', Points.whole(2 ** 50)],
    ['NaN', Points.ofHundredths(Number.NaN)],
  ])('refuses %s', (_, result) => {
    expect(result).toEqual(refuse('not-whole-units'));
  });

  it.each([
    ['a fraction of a hundredth', () => pointsOfHundredths(0.5)],
    ['a fractional whole', () => pointsWhole(1.5)],
    ['a fractional factor', () => pointsWhole(1).times(1.5)],
  ])(
    'throws on %s from the internal constructors (a programmer error)',
    (_, make) => {
      expect(make).toThrow(/Points/);
    },
  );

  it('is immutable', () => {
    expect(Object.isFrozen(unwrap(Points.whole(1)))).toBe(true);
  });
});

describe('StandingsPoints', () => {
  it('keeps four decimals and rounds to the cent half away from zero', () => {
    const points = (units: number) =>
      unwrap(StandingsPoints.ofTenThousandths(units));
    expect(points(6_311_610).toString()).toBe('631.1610');
    expect(points(6_311_610).toCents()).toBe(63_116);
    expect(points(6_311_650).toCents()).toBe(63_117);
    expect(points(-6_311_650).toCents()).toBe(-63_117);
    expect(unwrap(StandingsPoints.whole(190)).toString()).toBe('190.0000');
  });

  it.each([
    ['a fraction of a ten-thousandth', StandingsPoints.ofTenThousandths(0.5)],
    ['a fractional whole', StandingsPoints.whole(0.00005)],
  ])('refuses %s', (_, result) => {
    expect(result).toEqual(refuse('not-whole-units'));
  });

  it('throws on a fraction from the internal constructor', () => {
    expect(() => standingsPointsOfTenThousandths(0.5)).toThrow(
      /StandingsPoints/,
    );
  });
});

describe('Odds', () => {
  it('prints two places, and standings odds four', () => {
    expect(unwrap(Odds.ofHundredths(59)).toString()).toBe('0.59');
    expect(Odds.ONE.toString()).toBe('1.00');
    expect(unwrap(StandingsOdds.ofTenThousandths(23_219)).toString()).toBe(
      '2.3219',
    );
  });

  it('refuses negative odds and fractions of a unit', () => {
    expect(Odds.ofHundredths(-1)).toEqual(refuse('negative'));
    expect(StandingsOdds.ofTenThousandths(-1)).toEqual(refuse('negative'));
    expect(Odds.ofHundredths(0.5)).toEqual(refuse('not-whole-units'));
    expect(StandingsOdds.ofTenThousandths(0.5)).toEqual(
      refuse('not-whole-units'),
    );
  });

  it('throws on negative odds from the internal constructor', () => {
    expect(() => oddsOfHundredths(-1)).toThrow(/negative/);
  });
});

describe('Odds and oddsInvariant', () => {
  it('accept and refuse game and standings odds exactly as the invariant does', () => {
    for (const { value } of oddsInvariant.accepts) {
      expect(Odds.ofHundredths(value).ok).toBe(true);
      expect(StandingsOdds.ofTenThousandths(value).ok).toBe(true);
    }
    for (const { value } of oddsInvariant.refuses) {
      expect(Odds.ofHundredths(value)).toEqual(refuse('negative'));
      expect(StandingsOdds.ofTenThousandths(value)).toEqual(refuse('negative'));
    }
  });
});

describe('decimalUnits', () => {
  it.each([
    ['-45.00', 2, -4500],
    ['0.59', 2, 59],
    ['12', 2, 1200],
    ['631.1610', 4, 6_311_610],
    ['631.161', 4, 6_311_610],
    ['0.0000', 4, 0],
    ['-0.00', 2, 0],
  ])('reads %s with %i places as %i units, exactly', (text, places, units) => {
    expect(decimalUnits(text, places)).toEqual({ ok: true, value: units });
  });

  it('never reads a negative zero', () => {
    const result = decimalUnits('-0.00', 2);
    expect(result.ok && Object.is(result.value, 0)).toBe(true);
  });

  it.each([
    ['more places than the column has', '0.591', 2, 'too-many-places'],
    ['an exponent', '1e-05', 4, 'not-a-decimal'],
    ['an empty text', '', 2, 'not-a-decimal'],
    ['a bare point', '.5', 2, 'not-a-decimal'],
    ['a plus sign', '+1.00', 2, 'not-a-decimal'],
    ['more units than a safe integer', '99999999999999.99', 4, 'not-a-decimal'],
  ] as const)('refuses %s', (_, text, places, refusal) => {
    expect(decimalUnits(text, places)).toEqual(refuse(refusal));
  });
});
