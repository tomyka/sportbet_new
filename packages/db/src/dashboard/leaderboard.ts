import {
  leaderboardRows,
  type LeaderboardRow,
  type LeaderboardTournament,
  type RuleSet,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadUsernames } from '../hub/repository';
import { loadTournamentPoints } from '../points/repository';
import { loadMatchPredictions } from '../prediction/repository';
import { loadTournamentCatalogue } from '../tournament/catalogue';
import { loadListed } from './league-table';

/**
 * MainController::leaderboard: every tournament's stored rows of the rule
 * set's own source (loadTournamentPoints), its listed players
 * (listedPlayers), its predictions and whether it is public, then the
 * usernames of everyone with a row, handed to leaderboardRows, which
 * decides who counts (R-77, R-77 amended) and ranks (R-18).
 */
export async function loadLeaderboard(
  db: Executor,
  rules: RuleSet,
): Promise<readonly LeaderboardRow[]> {
  const tournaments: LeaderboardTournament[] = [];
  for (const { tournament, profile } of await loadTournamentCatalogue(db)) {
    tournaments.push({
      rows: await loadTournamentPoints(db, tournament, rules.name),
      listed: await loadListed(db, tournament, rules),
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

/**
 * PlayerTotals::anyRecorded: is there a leaderboard to offer at all
 * ("Lyderiai" in the guest navigation)? The same rows the page draws,
 * asked whether there are any, so the navigation never offers an empty
 * board (sportbet issue 131) - a non-public tournament's rows (R-77
 * amended) or only switched-off players' leave it out.
 */
export async function anyLeaderboardEntry(
  db: Executor,
  rules: RuleSet,
): Promise<boolean> {
  return (await loadLeaderboard(db, rules)).length > 0;
}
