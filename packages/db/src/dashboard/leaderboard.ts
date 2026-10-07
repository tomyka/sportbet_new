import {
  leaderboardRows,
  type LeaderboardRow,
  type LeaderboardTournament,
  type RuleSet,
} from '@sportbet/domain';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOfTournament } from '../edge';
import { loadUsernames } from '../hub/repository';
import { loadPlayerStatuses } from '../player/repository';
import { matchPoints } from '../points/schema';
import { loadTournamentTotals } from '../points/totals';
import { loadMatchPredictions } from '../prediction/repository';
import { loadTournamentCatalogue } from '../tournament/catalogue';

/**
 * MainController::leaderboard: every tournament's stored rows under the
 * rule set (loadTournamentTotals), its listed players (RA-4), its
 * predictions and whether it is public (R-50, R-77 amended), then the usernames of everyone with a row, handed to
 * leaderboardRows, which decides who counts (R-77) and ranks (R-18).
 */
export async function loadLeaderboard(
  db: Executor,
  rules: RuleSet,
): Promise<readonly LeaderboardRow[]> {
  const tournaments: LeaderboardTournament[] = [];
  for (const { tournament, profile } of await loadTournamentCatalogue(db)) {
    const { rows } = await loadTournamentTotals(db, tournament, rules);
    const key = keyOfTournament(tournament);
    const statuses = await loadPlayerStatuses(db, tournament, rules);
    tournaments.push({
      rows,
      listed: new Set(
        [...statuses].flatMap(([player, status]) =>
          status.isListedIn(key, rules) ? [player] : [],
        ),
      ),
      predictions: await loadMatchPredictions(db, tournament),
      isPublic: profile.isPublic,
    });
  }
  const scored = new Set(
    tournaments.flatMap(({ rows }) => rows.matches.map(({ player }) => player)),
  );
  return leaderboardRows({
    tournaments,
    usernames: await loadUsernames(db, [...scored]),
    rules,
  });
}

const anyRows = z.array(z.object({ one: z.literal(1) }));

/**
 * PlayerTotals::anyRecorded: is there a leaderboard to offer at all - a
 * match points row of the rule set's own source ("Lyderiai" in the guest
 * navigation).
 */
export async function anyLeaderboardEntry(
  db: Executor,
  rules: RuleSet,
): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1`.mapWith(Number) })
    .from(matchPoints)
    .where(eq(matchPoints.source, rules.name))
    .limit(1);
  return anyRows.parse(rows).length > 0;
}
