import {
  loadGuestPanels,
  loadLeagueMedals,
  loadLeagueTable,
  type GuestPanels,
  type LeagueTable,
} from '@sportbet/db';
import { ruledRules, type MedalRow, type Tournament } from '@sportbet/domain';
import { unstable_cache } from 'next/cache';
import { getDb } from './db';
import { LEADERBOARD_REVALIDATE_SECONDS } from './leaderboard';
import { DERIVED_POINTS_TAG } from './points-changed';

/** The tournament page's public league: its table and its medals. */
export interface PublicLeague {
  readonly table: LeagueTable;
  readonly medals: readonly MedalRow[];
}

/**
 * The tournament page's league table and medals under the live rule set,
 * read at most once a minute per tournament, as the leaderboard is: the
 * page is public, and the table's read (every listed player's rows and
 * history) is too much for each request. Expired with every derived-points
 * cache (pointsChanged).
 */
export function cachedPublicLeague(
  tournament: Tournament,
): Promise<PublicLeague> {
  return unstable_cache(
    async (): Promise<PublicLeague> => {
      const db = getDb();
      return {
        table: await loadLeagueTable(db, tournament, ruledRules),
        medals: await loadLeagueMedals(db, tournament, ruledRules),
      };
    },
    ['public-league', String(tournament.id), ruledRules.name],
    { revalidate: LEADERBOARD_REVALIDATE_SECONDS, tags: [DERIVED_POINTS_TAG] },
  )();
}

/**
 * A hub card's guest panels ("Lyderiai", "Finalų prognozės",
 * "Statistika") under the live rule set, read at most once a minute per
 * tournament: an anonymous '/' asks for them on every request. Expired with
 * every derived-points cache (pointsChanged).
 */
export function cachedGuestPanels(
  tournament: Tournament,
): Promise<GuestPanels> {
  return unstable_cache(
    async () => loadGuestPanels(getDb(), tournament, ruledRules),
    ['guest-panels', String(tournament.id), ruledRules.name],
    { revalidate: LEADERBOARD_REVALIDATE_SECONDS, tags: [DERIVED_POINTS_TAG] },
  )();
}
