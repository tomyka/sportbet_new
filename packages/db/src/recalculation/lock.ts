import { sql } from 'drizzle-orm';
import type { Executor } from '../client';

/**
 * The first key of every tournament recalculation lock: a fixed number no
 * other advisory lock in this app uses (the second key is the tournament's
 * id).
 */
export const RECALCULATION_LOCK_NAMESPACE = 21_007;

/**
 * Serializes the writers that recalculate one tournament - saveResult,
 * registerForTournament, recalculateAll - so two never rewrite its derived
 * rows at once (pg_advisory_xact_lock, held until the transaction ends).
 * Taken first, before any row lock. The lock order every writer keeps:
 * this lock, then the game row (a result write FOR NO KEY UPDATE, a
 * prediction save FOR SHARE), then the game's match_predictions rows by
 * player, then the players' tournament_players rows (lockPlayerStatuses)
 * by player, then by tournament. Inside a transaction only.
 */
export async function lockTournamentForRecalculation(
  tx: Executor,
  tournament: number,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${RECALCULATION_LOCK_NAMESPACE}::int, ${tournament}::int)`,
  );
}
