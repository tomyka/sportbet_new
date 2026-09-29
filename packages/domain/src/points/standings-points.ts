import { ok, refuse, type Result } from '../shared/result';
import {
  assertUnits,
  formatUnits,
  isWholeUnits,
  roundUnits,
  type UnitsRefusal,
} from './fixed-point';

/** Set once, by the class's static block: the only way past its constructor. */
let construct: (tenThousandths: number) => StandingsPoints;

/**
 * Standings points: an exact number of ten-thousandths. Stored with four
 * decimals, shown with one, ranked to the cent (ST-9, R-31).
 *
 * Built from outside the domain through `ofTenThousandths` or `whole`,
 * which refuse a value that is not a whole number of units. Inside it,
 * values valid by construction use standingsPointsOfTenThousandths and
 * standingsPointsWhole (not exported from the package), which throw.
 */
export class StandingsPoints {
  static readonly ZERO = new StandingsPoints(0);

  static {
    construct = (tenThousandths) =>
      tenThousandths === 0
        ? StandingsPoints.ZERO
        : new StandingsPoints(tenThousandths);
  }

  readonly tenThousandths: number;

  private constructor(tenThousandths: number) {
    this.tenThousandths = tenThousandths;
    Object.freeze(this);
  }

  static ofTenThousandths(
    tenThousandths: number,
  ): Result<StandingsPoints, UnitsRefusal> {
    return isWholeUnits(tenThousandths)
      ? ok(construct(tenThousandths))
      : refuse('not-whole-units');
  }

  static whole(points: number): Result<StandingsPoints, UnitsRefusal> {
    return isWholeUnits(points)
      ? StandingsPoints.ofTenThousandths(points * 10_000)
      : refuse('not-whole-units');
  }

  plus(other: StandingsPoints): StandingsPoints {
    return standingsPointsOfTenThousandths(
      this.tenThousandths + other.tenThousandths,
    );
  }

  /** Rounded half away from zero to hundredths: what ranking compares. */
  toCents(): number {
    return roundUnits(this.tenThousandths, 2);
  }

  equals(other: StandingsPoints): boolean {
    return this.tenThousandths === other.tenThousandths;
  }

  /** Four decimals, as sportbet stores them: "631.1610". */
  toString(): string {
    return formatUnits(this.tenThousandths, 4);
  }
}

/** Internal: standings points valid by construction (see StandingsPoints). */
export function standingsPointsOfTenThousandths(
  tenThousandths: number,
): StandingsPoints {
  assertUnits(tenThousandths, 'StandingsPoints');
  return construct(tenThousandths);
}

/** Internal: whole standings points valid by construction. */
export function standingsPointsWhole(points: number): StandingsPoints {
  assertUnits(points, 'StandingsPoints');
  return standingsPointsOfTenThousandths(points * 10_000);
}
