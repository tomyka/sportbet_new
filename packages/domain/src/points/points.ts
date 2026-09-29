import { assertUnits, formatUnits } from './fixed-point';

/**
 * Match, serija and survival points: an exact number of hundredths.
 * Euroleague match points are always whole or half (MS-9, R-31), so
 * hundredths hold every value sportbet stores in DECIMAL(8,2).
 */
export class Points {
  static readonly ZERO = new Points(0);

  readonly hundredths: number;

  private constructor(hundredths: number) {
    this.hundredths = hundredths;
    Object.freeze(this);
  }

  static ofHundredths(hundredths: number): Points {
    assertUnits(hundredths, 'Points');
    return hundredths === 0 ? Points.ZERO : new Points(hundredths);
  }

  static whole(points: number): Points {
    assertUnits(points, 'Points');
    return Points.ofHundredths(points * 100);
  }

  plus(other: Points): Points {
    return Points.ofHundredths(this.hundredths + other.hundredths);
  }

  /** Multiplied by a whole number, e.g. a round's rate (LR-4). */
  times(factor: number): Points {
    assertUnits(factor, 'Points factor');
    return Points.ofHundredths(this.hundredths * factor);
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
