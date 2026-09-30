import { defineRangeInvariant } from '../invariant/range-invariant';
import { ok, refuse, type Result } from '../shared/result';
import {
  assertUnits,
  formatUnits,
  isWholeUnits,
  type UnitsRefusal,
} from './fixed-point';

export type OddsRefusal = UnitsRefusal | 'negative';

/**
 * Crowd odds are never negative (CO-1 to CO-4, ST-4). Only the sign is
 * drawn, so the one invariant holds for hundredths (game odds) and
 * ten-thousandths (standings odds) alike.
 */
export const oddsInvariant = defineRangeInvariant({
  name: 'odds',
  min: 0,
  accepts: [
    { label: 'no votes', value: 0 },
    { label: 'a favourite, 0.59', value: 59 },
  ],
  refuses: [{ label: 'a negative value', value: -1 }],
});

/** Set once each, by the static blocks: the only ways past the constructors. */
let constructOdds: (hundredths: number) => Odds;
let constructStandingsOdds: (tenThousandths: number) => StandingsOdds;

function oddsRefusal(units: number): OddsRefusal | null {
  if (!isWholeUnits(units)) return 'not-whole-units';
  return oddsInvariant.schema.safeParse(units).success ? null : 'negative';
}

function assertOdds(units: number, what: string): void {
  assertUnits(units, what);
  if (units < 0) {
    throw new Error(`${what}: ${String(units)} is negative`);
  }
}

/**
 * Game crowd odds: hundredths, as `game_odds` stores them (CO-2).
 *
 * Built from outside the domain through `ofHundredths`, which refuses a
 * negative value or one that is not a whole number of units. Inside it,
 * computed odds use oddsOfHundredths (not exported from the package),
 * which throws instead.
 */
export class Odds {
  static readonly ZERO = new Odds(0);
  /** What a game with no stored odds is scored at (CO-5). */
  static readonly ONE = new Odds(100);

  static {
    constructOdds = (hundredths) => new Odds(hundredths);
  }

  readonly hundredths: number;

  private constructor(hundredths: number) {
    this.hundredths = hundredths;
    Object.freeze(this);
  }

  static ofHundredths(hundredths: number): Result<Odds, OddsRefusal> {
    const refusal = oddsRefusal(hundredths);
    return refusal === null ? ok(new Odds(hundredths)) : refuse(refusal);
  }

  equals(other: Odds): boolean {
    return this.hundredths === other.hundredths;
  }

  /** "0.59" */
  toString(): string {
    return formatUnits(this.hundredths, 2);
  }
}

/** Standings crowd odds: ten-thousandths (ST-4, ST-9), built as Odds are. */
export class StandingsOdds {
  static readonly ZERO = new StandingsOdds(0);

  static {
    constructStandingsOdds = (tenThousandths) =>
      new StandingsOdds(tenThousandths);
  }

  readonly tenThousandths: number;

  private constructor(tenThousandths: number) {
    this.tenThousandths = tenThousandths;
    Object.freeze(this);
  }

  static ofTenThousandths(
    tenThousandths: number,
  ): Result<StandingsOdds, OddsRefusal> {
    const refusal = oddsRefusal(tenThousandths);
    return refusal === null
      ? ok(new StandingsOdds(tenThousandths))
      : refuse(refusal);
  }

  equals(other: StandingsOdds): boolean {
    return this.tenThousandths === other.tenThousandths;
  }

  /** "2.3219" */
  toString(): string {
    return formatUnits(this.tenThousandths, 4);
  }
}

/** Internal: odds valid by construction; a bad value throws (see Odds). */
export function oddsOfHundredths(hundredths: number): Odds {
  assertOdds(hundredths, 'Odds');
  return constructOdds(hundredths);
}

/** Internal: standings odds valid by construction (see StandingsOdds). */
export function standingsOddsOfTenThousandths(
  tenThousandths: number,
): StandingsOdds {
  assertOdds(tenThousandths, 'StandingsOdds');
  return constructStandingsOdds(tenThousandths);
}
