import { assertUnits, formatUnits } from './fixed-point';

/** Game crowd odds: hundredths, as `game_odds` stores them (CO-2). */
export class Odds {
  static readonly ZERO = new Odds(0);
  /** What a game with no stored odds is scored at (CO-5). */
  static readonly ONE = new Odds(100);

  readonly hundredths: number;

  private constructor(hundredths: number) {
    this.hundredths = hundredths;
    Object.freeze(this);
  }

  static ofHundredths(hundredths: number): Odds {
    assertUnits(hundredths, 'Odds');
    if (hundredths < 0) {
      throw new Error(`Odds: ${String(hundredths)} is negative`);
    }
    return new Odds(hundredths);
  }

  equals(other: Odds): boolean {
    return this.hundredths === other.hundredths;
  }

  /** "0.59" */
  toString(): string {
    return formatUnits(this.hundredths, 2);
  }
}

/** Standings crowd odds: ten-thousandths (ST-4, ST-9). */
export class StandingsOdds {
  static readonly ZERO = new StandingsOdds(0);

  readonly tenThousandths: number;

  private constructor(tenThousandths: number) {
    this.tenThousandths = tenThousandths;
    Object.freeze(this);
  }

  static ofTenThousandths(tenThousandths: number): StandingsOdds {
    assertUnits(tenThousandths, 'StandingsOdds');
    if (tenThousandths < 0) {
      throw new Error(`StandingsOdds: ${String(tenThousandths)} is negative`);
    }
    return new StandingsOdds(tenThousandths);
  }

  equals(other: StandingsOdds): boolean {
    return this.tenThousandths === other.tenThousandths;
  }

  /** "2.3219" */
  toString(): string {
    return formatUnits(this.tenThousandths, 4);
  }
}
