import type { BoardEffect } from '@sportbet/db';
import { revalidateTag } from 'next/cache';

/**
 * The tag on every cached read derived from the stored points or from who
 * is listed (today the leaderboard, its "Lyderiai" check, the public league
 * and the hub's guest panels): a cache of derived points carries it, and
 * expireBoard expires them all.
 */
export const DERIVED_POINTS_TAG = 'derived-points';

/**
 * The one place the writers' signal reaches the cache. After a write whose
 * result says the board changed - a result saved, a recalculation, a
 * tournament joined (its fill-ins scored), a player switched back on by a
 * prediction, hidden or deleted - every cached read of the points is read
 * afresh on its next request; a write that says nothing moved expires
 * nothing. Any other change shows when its cache lapses. Returns the result,
 * so a caller expires and goes on with it.
 */
export function expireBoard<Written extends BoardEffect>(
  written: Written,
): Written {
  if (written.boardChanged) {
    revalidateTag(DERIVED_POINTS_TAG, { expire: 0 });
  }
  return written;
}
