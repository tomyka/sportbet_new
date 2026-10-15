import { Rate } from '../score/score';
import type { RoundNumber } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import { Round } from './round';
import type { RoundEntry } from './round-form';
import type { Season } from './season';
import { STAGE_RATES, type Stage } from './stage';

/** A round as the admin set it: its display name and the round itself. */
export interface AdminRound {
  readonly name: string;
  readonly round: Round;
}

/** What every admin decision is told of the tournament (R-110, R-21). */
export interface FinishedGuard {
  /** The tournament is finished (R-21's isFinishedWindowAt) at the moment the writer decides. */
  readonly finished: boolean;
}

export type InsertRoundRefusal = 'tournament-finished' | 'duplicate-number';
export type ChangeRoundRefusal = InsertRoundRefusal | 'unknown-round';
export type DeleteRoundRefusal =
  'tournament-finished' | 'unknown-round' | 'has-games' | 'has-picks';

/**
 * The round as the admin set it, kept as it is: sportbet lets an admin set
 * any rate and survival flag (LR-4, SU-7), and R-10 only prefills the rate.
 */
function adminRound(entry: RoundEntry): AdminRound {
  return {
    name: entry.name,
    round: Round.stored({
      number: entry.number,
      stage: entry.stage,
      rate: entry.rate,
      survival: entry.survival,
      knockout: entry.knockout,
    }),
  };
}

/**
 * R-10: a round's stage is chosen on the form and its rate prefilled from
 * it (play-in 1, play-offs 2, Final Four 3, final 3, regular 1).
 */
export function stageRate(stage: Stage): Rate {
  const rate = Rate.of(STAGE_RATES[stage]);
  if (!rate.ok) throw new Error(`stageRate: ${stage}'s rate is not a rate`);
  return rate.value;
}

/**
 * InsertEventRequest's round, decided: refused on a finished tournament
 * (R-110) or a number the tournament already has (Season.create's
 * duplicate-round, and the table's unique key).
 */
export function insertRound(
  season: Season,
  entry: RoundEntry,
  guard: FinishedGuard,
): Result<AdminRound, InsertRoundRefusal> {
  if (guard.finished) return refuse('tournament-finished');
  if (season.round(entry.number) !== undefined) {
    return refuse('duplicate-number');
  }
  return ok(adminRound(entry));
}

/**
 * UpdateEventRequest's change of the round numbered `number`: its number
 * may change (its games follow, they hold the round, not the number) but
 * not onto another round's.
 */
export function changeRound(
  season: Season,
  number: RoundNumber,
  entry: RoundEntry,
  guard: FinishedGuard,
): Result<AdminRound, ChangeRoundRefusal> {
  if (guard.finished) return refuse('tournament-finished');
  if (season.round(number) === undefined) return refuse('unknown-round');
  if (entry.number !== number && season.round(entry.number) !== undefined) {
    return refuse('duplicate-number');
  }
  return ok(adminRound(entry));
}

/**
 * Deleting the round numbered `number`. sportbet deletes with no check of
 * its games; the round's key is `restrict` here, so a round with games is
 * kept as the domain's refusal rather than a database error; so is one a
 * survival pick or points row still names (`hasPicks`: a pick outlives a
 * game deleted under R-89, and its key is `restrict` too).
 */
export function deleteRound(
  season: Season,
  number: RoundNumber,
  guard: FinishedGuard & { readonly hasPicks: boolean },
): Result<null, DeleteRoundRefusal> {
  if (guard.finished) return refuse('tournament-finished');
  if (season.round(number) === undefined) return refuse('unknown-round');
  if (season.games.some((game) => game.round === number)) {
    return refuse('has-games');
  }
  return guard.hasPicks ? refuse('has-picks') : ok(null);
}

/**
 * Whether changing a round from `before` to `after` can move a point: any of
 * its number, stage, rate or the survival and knockout flags (the name is
 * display only). The writer recalculates when it does.
 */
export function roundMovesPoints(before: Round, after: Round): boolean {
  return (
    before.number !== after.number ||
    before.stage !== after.stage ||
    before.rate.value !== after.rate.value ||
    before.survival !== after.survival ||
    before.knockout !== after.knockout
  );
}
