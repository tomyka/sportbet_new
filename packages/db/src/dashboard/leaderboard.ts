import {
  leaderboardRows,
  type LeaderboardRow,
  type LeaderboardTournament,
  type PlayerId,
  type RuleSet,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadTournamentCatalogue } from '../tournament/catalogue';
import { loadScoredOrigins, loadTournamentStanding } from './standing';

/**
 * MainController::leaderboard: every tournament's standing under the rule
 * set (loadTournamentStanding: its rows and listed players), its scored
 * predictions' origins (loadScoredOrigins) and whether it is public, handed to
 * leaderboardRows, which decides who counts (R-77, R-77 amended) and
 * ranks (R-18).
 */
export async function loadLeaderboard(
  db: Executor,
  rules: RuleSet,
): Promise<readonly LeaderboardRow[]> {
  const tournaments: LeaderboardTournament[] = [];
  const usernames = new Map<PlayerId, string>();
  for (const { tournament, profile } of await loadTournamentCatalogue(db)) {
    const standing = await loadTournamentStanding(db, tournament, rules);
    for (const [player, username] of standing.usernames) {
      usernames.set(player, username);
    }
    tournaments.push({
      rows: standing.rows,
      listed: standing.listed,
      predictions: await loadScoredOrigins(db, tournament, rules),
      isPublic: profile.isPublic,
    });
  }
  return leaderboardRows({ tournaments, usernames, rules });
}
