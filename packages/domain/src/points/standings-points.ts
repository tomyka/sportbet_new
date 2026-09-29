import { assertUnits, formatUnits, roundUnits } from './fixed-point';

/**
 * Standings points: an exact number of ten-thousandths. Stored with four
 * decimals, shown with one, ranked to the cent (ST-9, R-31).
 */
export class StandingsPoints {
  static readonly ZERO = new StandingsPoints(0);

  readonly tenThousandths: number;

  private constructor(tenThousandths: number) {
    this.tenThousandths = tenThousandths;
    Object.freeze(this);
  }

  static ofTenThousandths(tenThousandths: number): StandingsPoints {
    assertUnits(tenThousandths, 'StandingsPoints');
    return tenThousandths === 0
      ? StandingsPoints.ZERO
      : new StandingsPoints(tenThousandths);
  }

  static whole(points: number): StandingsPoints {
    assertUnits(points, 'StandingsPoints');
    return StandingsPoints.ofTenThousandths(points * 10_000);
  }

  plus(other: StandingsPoints): StandingsPoints {
    return StandingsPoints.ofTenThousandths(
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
