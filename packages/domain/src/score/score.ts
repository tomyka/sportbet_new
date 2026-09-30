import { defineRangeInvariant } from '../invariant/range-invariant';
import { ok, refuse, type Result } from '../shared/result';

/**
 * One side of a result, or of a stored prediction: a whole number, never
 * negative (R-41; sportbet's UpdateResultRequest refuses one too, min:0).
 */
export const scoreSideInvariant = defineRangeInvariant({
  name: 'score side',
  min: 0,
  accepts: [
    { label: 'zero', value: 0 },
    { label: 'a basketball score', value: 88 },
  ],
  refuses: [
    { label: "sportbet's old postponed marker, -1", value: -1 },
    { label: 'a large negative score', value: -120 },
  ],
});

/** A round's multiplier: a whole number of at least 1 (LR-4). */
export const rateInvariant = defineRangeInvariant({
  name: 'rate',
  min: 1,
  accepts: [
    { label: 'the regular season', value: 1 },
    { label: 'the Final Four', value: 3 },
  ],
  refuses: [
    { label: 'zero, which sportbet lets an admin save', value: 0 },
    { label: 'a negative rate', value: -1 },
  ],
});

export type Outcome = 'home' | 'away' | 'level';

export type ScoreRefusal = 'not-a-whole-number' | 'negative';

/**
 * Two non-negative whole numbers, home and away. A negative score is
 * refused under both sets (R-41): sportbet's result validation refuses it
 * too (UpdateResultRequest, min:0), so its old -1 "postponed" marker never
 * reaches a game; the rebuild has `Game.postpone` instead. Whether a level
 * score is allowed is the caller's rule (R-38, MS-1), not the value's.
 */
export class Score {
  readonly home: number;
  readonly away: number;

  private constructor(home: number, away: number) {
    this.home = home;
    this.away = away;
    Object.freeze(this);
  }

  static of(home: number, away: number): Result<Score, ScoreRefusal> {
    if (!Number.isSafeInteger(home) || !Number.isSafeInteger(away)) {
      return refuse('not-a-whole-number');
    }
    const side = scoreSideInvariant.schema;
    if (!side.safeParse(home).success || !side.safeParse(away).success) {
      return refuse('negative');
    }
    return ok(new Score(home, away));
  }

  /** Home minus away (MS-5). */
  margin(): number {
    return this.home - this.away;
  }

  outcome(): Outcome {
    if (this.home > this.away) return 'home';
    if (this.home < this.away) return 'away';
    return 'level';
  }

  isLevel(): boolean {
    return this.home === this.away;
  }

  equals(other: Score): boolean {
    return this.home === other.home && this.away === other.away;
  }
}

/** A round's whole-number multiplier (LR-4). */
export class Rate {
  static readonly ONE = new Rate(1);

  readonly value: number;

  private constructor(value: number) {
    this.value = value;
    Object.freeze(this);
  }

  static of(value: number): Result<Rate, 'not-a-positive-integer'> {
    if (!rateInvariant.schema.safeParse(value).success) {
      return refuse('not-a-positive-integer');
    }
    return ok(value === 1 ? Rate.ONE : new Rate(value));
  }
}
