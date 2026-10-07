import { revalidateTag } from 'next/cache';

/**
 * The tag on every cached read derived from the stored points or from who
 * is listed (today the leaderboard and its "Lyderiai" check): a cache of
 * derived points carries it, and pointsChanged expires them all.
 */
export const DERIVED_POINTS_TAG = 'derived-points';

/**
 * After a web path changes the points or the listing - a result saved, a
 * recalculation, a tournament joined (its fill-ins scored), a player
 * switched back on by a prediction - every cached read of them is read
 * afresh on its next request. Any other change shows when its cache
 * lapses.
 */
export function pointsChanged(): void {
  revalidateTag(DERIVED_POINTS_TAG, { expire: 0 });
}
