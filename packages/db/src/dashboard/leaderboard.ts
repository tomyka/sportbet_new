import {
  leaderboardRows,
  type LeaderboardRow,
  type LeaderboardTournament,
  type PlayerId,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadTournamentCatalogue } from '../tournament/catalogue';
import { loadScoredOrigins, loadTournamentStanding } from './standing';

/**
 * MainController::leaderboard: every tournament's standing under the rule
 * set (loadTournamentStanding: its rows and listed players, tournament-wide
 * as PlayerTotals::allTime is, never a league's), its scored
 * predictions' origins (loadScoredOrigins) and whether it is public, handed to
 * leaderboardRows, which decides who counts (R-77, R-77 amended) and
 * ranks (R-18).
 */
export async function loadLeaderboard(
  db: Executor,
): Promise<readonly LeaderboardRow[]> {
  const tournaments: LeaderboardTournament[] = [];
  const usernames = new Map<PlayerId, string>();
  for (const { tournament, profile } of await loadTournamentCatalogue(db)) {
    const standing = await loadTournamentStanding(
      db,
      tournament,
      'whole-tournament',
    );
    for (const [player, username] of standing.usernames) {
      usernames.set(player, username);
    }
    tournaments.push({
      rows: standing.rows,
      listed: standing.listed,
      predictions: await loadScoredOrigins(db, tournament),
      isPublic: profile.isPublic,
    });
  }
  return leaderboardRows({ tournaments, usernames });
}
