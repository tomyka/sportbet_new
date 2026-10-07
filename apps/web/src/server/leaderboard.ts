import { anyLeaderboardEntry, loadLeaderboard } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { revalidateTag, unstable_cache } from 'next/cache';
import { getDb } from './db';

/** The cached read's tag, which a write to the points expires. */
const LEADERBOARD_TAG = 'leaderboard';

/** How long a read of the leaderboard is served before it is read again. */
export const LEADERBOARD_REVALIDATE_SECONDS = 60;

/**
 * /leaderboard's rows under the live rule set, read at most once a minute
 * (Next's data cache): loadLeaderboard reads every tournament's rows and
 * predictions, too much for each request to a public page. A result saved
 * through the app shows at once (expireLeaderboard); any other change
 * within a minute.
 */
export const cachedLeaderboard = unstable_cache(
  async () => loadLeaderboard(getDb(), ruledRules),
  ['leaderboard', ruledRules.name],
  { revalidate: LEADERBOARD_REVALIDATE_SECONDS, tags: [LEADERBOARD_TAG] },
);

/**
 * Whether a guest is offered "Lyderiai" (anyLeaderboardEntry), cached as
 * the board is and expired with it: every guest render asks.
 */
export const cachedLeaderboardOffered = unstable_cache(
  async () => anyLeaderboardEntry(getDb(), ruledRules),
  ['leaderboard-offered', ruledRules.name],
  { revalidate: LEADERBOARD_REVALIDATE_SECONDS, tags: [LEADERBOARD_TAG] },
);

/** After the points change (a result saved, a recalculation): the next reads of both are fresh. */
export function expireLeaderboard(): void {
  revalidateTag(LEADERBOARD_TAG, { expire: 0 });
}
