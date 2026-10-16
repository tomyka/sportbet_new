import {
  tournamentFacts,
  tournamentFactsSchema,
  type Tournament,
  type TournamentFacts,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { listTeams } from '../team/repository';

/** A tournament and what /rules and /help state of it (slice 18, #35). */
export interface DescribedTournament {
  readonly tournament: Tournament;
  readonly facts: TournamentFacts;
}

/**
 * The facts of any tournament (R-106, R-133): its team count, the one read
 * behind a player's and a visitor's rules and help pages; the deadline round
 * and the survival switch are the tournament's own. Parsed with the domain's
 * schema before it leaves.
 */
export async function loadTournamentFacts(
  db: Executor,
  tournament: Tournament,
): Promise<TournamentFacts> {
  const teamCount = (await listTeams(db, tournament)).length;
  return tournamentFactsSchema.parse(tournamentFacts(tournament, teamCount));
}
