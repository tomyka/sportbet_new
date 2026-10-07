import { loadLeaderboard } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { unstable_cache } from 'next/cache';
import { getDb } from './db';
import { DERIVED_POINTS_TAG } from './points-changed';

/** How long a read of the leaderboard is served before it is read again. */
export const LEADERBOARD_REVALIDATE_SECONDS = 60;

/**
 * /leaderboard's rows under the live rule set, read at most once a minute
 * (Next's data cache): loadLeaderboard reads every tournament's rows, too
 * much for each request to a public page. A change made through the app
 * shows at once (pointsChanged); any other within a minute.
 */
export const cachedLeaderboard = unstable_cache(
  async () => loadLeaderboard(getDb(), ruledRules),
  ['leaderboard', ruledRules.name],
  { revalidate: LEADERBOARD_REVALIDATE_SECONDS, tags: [DERIVED_POINTS_TAG] },
);

/**
 * Whether a guest is offered "Lyderiai": the board itself has a row, so
 * the navigation can never disagree with the page about who counts.
 */
export async function cachedLeaderboardOffered(): Promise<boolean> {
  return (await cachedLeaderboard()).length > 0;
}
