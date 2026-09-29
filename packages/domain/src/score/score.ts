import { ok, refuse, type Result } from '../shared/result';

export type Outcome = 'home' | 'away' | 'level';

export type ScoreRefusal = 'not-a-whole-number' | 'negative';

/**
 * Two non-negative whole numbers, home and away. Whether a level score is
 * allowed is the caller's rule (R-38, MS-1), not the value's.
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
    if (home < 0 || away < 0) {
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
    if (!Number.isSafeInteger(value) || value <= 0) {
      return refuse('not-a-positive-integer');
    }
    return ok(value === 1 ? Rate.ONE : new Rate(value));
  }
}
