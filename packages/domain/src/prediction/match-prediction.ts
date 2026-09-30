import type { RuleSet } from '../rules/rule-set';
import type { GameId, PlayerId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { Outcome, Score } from '../score/score';

/** The lowest and highest score a player may enter for either side (MS-1). */
export const PREDICTION_MIN = 50;
export const PREDICTION_MAX = 120;

/**
 * Where a prediction came from. A fill-in is the owner's word for
 * sportbet's generated prediction (FI-1); a late fill-in is one made for a
 * late joiner's games already played (R-9). The database's
 * `prediction_origin` enum is built from this list.
 */
export const PREDICTION_ORIGINS = ['real', 'fill-in', 'late-fill-in'] as const;

export type PredictionOrigin = (typeof PREDICTION_ORIGINS)[number];

export interface PredictionEntry {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly home: number | null;
  readonly away: number | null;
}

export type PredictionRefusal =
  'not-a-whole-number' | 'out-of-range' | 'level' | 'half-typed';

interface PredictionState extends PredictionEntry {
  readonly origin: PredictionOrigin;
  readonly filledInAt: Instant | null;
}

/** A prediction row as stored (MatchPrediction.stored). */
export type StoredPrediction = PredictionState;

export type StoredPredictionRefusal =
  | 'not-a-whole-number'
  | 'negative'
  | 'level'
  | 'fill-in-without-score'
  | 'real-with-fill-in-time';

function sideProblem(side: number | null): PredictionRefusal | null {
  if (side === null) return null;
  if (!Number.isSafeInteger(side)) return 'not-a-whole-number';
  if (side < PREDICTION_MIN || side > PREDICTION_MAX) return 'out-of-range';
  return null;
}

/** One player's prediction of one game's score. */
export class MatchPrediction {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly origin: PredictionOrigin;
  readonly home: number | null;
  readonly away: number | null;
  /** The predicted outcome; null unless both scores are entered. */
  readonly outcome: Outcome | null;
  /** When a fill-in was made (FI-4); null for a real prediction. */
  readonly filledInAt: Instant | null;

  private constructor(state: PredictionState) {
    this.player = state.player;
    this.game = state.game;
    this.origin = state.origin;
    this.home = state.home;
    this.away = state.away;
    this.filledInAt = state.filledInAt;
    this.outcome =
      state.home === null || state.away === null
        ? null
        : state.home > state.away
          ? 'home'
          : 'away';
    Object.freeze(this);
  }

  /**
   * MS-1: two whole scores from 50 to 120 that are not level, or both
   * blank. A half-typed prediction is stored by sportbet and refused under
   * R-15.
   */
  static enter(
    entry: PredictionEntry,
    rules: RuleSet,
  ): Result<MatchPrediction, PredictionRefusal> {
    const problem = sideProblem(entry.home) ?? sideProblem(entry.away);
    if (problem !== null) {
      return refuse(problem);
    }
    if (entry.home !== null && entry.home === entry.away) {
      return refuse('level');
    }
    if ((entry.home === null) !== (entry.away === null)) {
      if (!rules.halfTypedPredictionStored) {
        return refuse('half-typed');
      }
    }
    return ok(
      new MatchPrediction({ ...entry, origin: 'real', filledInAt: null }),
    );
  }

  /**
   * A fill-in with the score the generator drew (FI-2), made at `madeAt`.
   * The generator never draws a level score, so one is a programmer error.
   */
  static fillIn(
    player: PlayerId,
    game: GameId,
    score: Score,
    origin: 'fill-in' | 'late-fill-in',
    madeAt: Instant,
  ): MatchPrediction {
    if (score.isLevel()) {
      throw new Error('MatchPrediction.fillIn: a fill-in is never level');
    }
    return new MatchPrediction({
      player,
      game,
      home: score.home,
      away: score.away,
      origin,
      filledInAt: madeAt,
    });
  }

  /**
   * A stored row read back, bypassing entry's rules where stored data
   * legitimately differs: a half-typed row (MS-2, sportbet stores them) or
   * a side outside 50-120 is kept. Its shape is still checked: whole,
   * non-negative, not level, a fill-in with both scores, and a fill-in time
   * only on a fill-in.
   *
   * sportbet rows carry `generated` (a 1/0/NULL blob, mapped to an origin
   * by sportbetColumns.prediction) but no fill-in time, so theirs read back with
   * `filledInAt` null, and 2.2's schema needs a nullable `filled_in_at`. A
   * fill-in without a time is never removed by R-5's correction, which
   * needs to know it was made before its game's tip-off (FI-4).
   */
  static stored(
    row: StoredPrediction,
  ): Result<MatchPrediction, StoredPredictionRefusal> {
    for (const side of [row.home, row.away]) {
      if (side === null) continue;
      if (!Number.isSafeInteger(side)) return refuse('not-a-whole-number');
      if (side < 0) return refuse('negative');
    }
    if (row.home !== null && row.home === row.away) {
      return refuse('level');
    }
    if (row.origin === 'real') {
      if (row.filledInAt !== null) return refuse('real-with-fill-in-time');
    } else if (row.home === null || row.away === null) {
      return refuse('fill-in-without-score');
    }
    return ok(new MatchPrediction({ ...row }));
  }

  /** Both scores entered: the only prediction that is scored or a vote. */
  isAnswered(): boolean {
    return this.outcome !== null;
  }

  /**
   * sportbet fills in the rows whose home score is blank (MS-2,
   * GeneratedPredictions::fillFor), so an away-only row is overwritten and a
   * home-only row is not. Under R-15 only a blank row can exist.
   */
  hasBlankHomeScore(): boolean {
    return this.home === null;
  }

  /** The same row, blank again: a fill-in removed (FI-4). */
  cleared(): MatchPrediction {
    return new MatchPrediction({
      player: this.player,
      game: this.game,
      home: null,
      away: null,
      origin: 'real',
      filledInAt: null,
    });
  }
}
