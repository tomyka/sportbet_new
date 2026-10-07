import type { Tournament } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import type { Executor } from '../client';

/**
 * The first key of every tournament recalculation lock: a fixed number no
 * other advisory lock in this app uses (the second key is the tournament's
 * id).
 */
export const RECALCULATION_LOCK_NAMESPACE = 21_007;

/**
 * Proof that a transaction holds one tournament's recalculation lock:
 * recalculateUnderRuleSet takes nothing else, so a recalculation without
 * the lock does not typecheck. Only lockTournamentForRecalculation makes
 * one, by taking the lock.
 */
export class TournamentLock {
  /** The transaction that holds the lock, until it ends. */
  readonly tx: Executor;
  readonly tournament: Tournament;

  private constructor(tx: Executor, tournament: Tournament) {
    this.tx = tx;
    this.tournament = tournament;
    Object.freeze(this);
  }

  /** lockTournamentForRecalculation's: the lock taken, then the proof. */
  static async take(
    tx: Executor,
    tournament: Tournament,
  ): Promise<TournamentLock> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${RECALCULATION_LOCK_NAMESPACE}::int, ${tournament.id}::int)`,
    );
    return new TournamentLock(tx, tournament);
  }
}

/**
 * Serializes the writers that recalculate one tournament - saveResult,
 * registerForTournament, recalculateAll, the reader - so two never rewrite
 * its derived rows at once (pg_advisory_xact_lock, held until the
 * transaction ends). Taken first, before any row lock. The lock order every
 * writer keeps: this lock, then the game row (a result write FOR NO KEY
 * UPDATE, a prediction save FOR SHARE), then the game's match_predictions
 * rows by player, then the players' tournament_players rows
 * (lockPlayerStatuses) by player, then by tournament. Inside a transaction
 * only: the TournamentLock it returns is valid until `tx` ends.
 */
export function lockTournamentForRecalculation(
  tx: Executor,
  tournament: Tournament,
): Promise<TournamentLock> {
  return TournamentLock.take(tx, tournament);
}
