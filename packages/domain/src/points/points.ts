import { ok, refuse, type Result } from '../shared/result';
import {
  assertUnits,
  formatUnits,
  isWholeUnits,
  type UnitsRefusal,
} from './fixed-point';

/** Set once, by the class's static block: the only way past its constructor. */
let construct: (hundredths: number) => Points;

/**
 * Match, serija and survival points: an exact number of hundredths.
 * Euroleague match points are always whole or half (MS-9, R-31), so
 * hundredths hold every value sportbet stores in DECIMAL(8,2).
 *
 * Built from outside the domain through `ofHundredths` or `whole`, which
 * refuse a value that is not a whole number of units. Inside it, values
 * valid by construction use pointsOfHundredths and pointsWhole (not
 * exported from the package), which throw instead.
 */
export class Points {
  static readonly ZERO = new Points(0);

  static {
    construct = (hundredths) =>
      hundredths === 0 ? Points.ZERO : new Points(hundredths);
  }

  readonly hundredths: number;

  private constructor(hundredths: number) {
    this.hundredths = hundredths;
    Object.freeze(this);
  }

  static ofHundredths(hundredths: number): Result<Points, UnitsRefusal> {
    return isWholeUnits(hundredths)
      ? ok(construct(hundredths))
      : refuse('not-whole-units');
  }

  static whole(points: number): Result<Points, UnitsRefusal> {
    return isWholeUnits(points)
      ? Points.ofHundredths(points * 100)
      : refuse('not-whole-units');
  }

  plus(other: Points): Points {
    return pointsOfHundredths(this.hundredths + other.hundredths);
  }

  /** Multiplied by a whole number, e.g. a round's rate (LR-4). */
  times(factor: number): Points {
    assertUnits(factor, 'Points factor');
    return pointsOfHundredths(this.hundredths * factor);
  }

  isPositive(): boolean {
    return this.hundredths > 0;
  }

  isMultipleOfHalf(): boolean {
    return this.hundredths % 50 === 0;
  }

  equals(other: Points): boolean {
    return this.hundredths === other.hundredths;
  }

  /** Two decimals, as sportbet stores them: "79.50", "-45.00". */
  toString(): string {
    return formatUnits(this.hundredths, 2);
  }
}

/** Internal: points valid by construction; a bad value throws (see Points). */
export function pointsOfHundredths(hundredths: number): Points {
  assertUnits(hundredths, 'Points');
  return construct(hundredths);
}

/** Internal: whole points valid by construction (see Points). */
export function pointsWhole(points: number): Points {
  assertUnits(points, 'Points');
  return pointsOfHundredths(points * 100);
}
