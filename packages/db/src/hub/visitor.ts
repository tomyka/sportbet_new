import type { Instant, RuleSet, Tournament } from '@sportbet/domain';
import type { Executor } from '../client';
import { loadTournamentFacts, type TournamentFacts } from '../tournament/facts';
import { firstUnfinishedTournament, type HubViewer } from './repository';

/** The tournament a guest's rules and help describe, with its facts. */
export interface VisitorTournament {
  readonly tournament: Tournament;
  readonly facts: TournamentFacts;
}

/**
 * Tournament::forVisitor for a guest, or a player with no tournament of
 * their own: the first hub card that is not finished, in the hub's order
 * (active before upcoming, earliest start, lowest id),
 * among those the viewer may see (R-50), so a non-public tournament is never
 * a guest's. Null when there is none.
 */
export async function findVisitorTournament(
  db: Executor,
  request: {
    readonly viewer: HubViewer;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<VisitorTournament | null> {
  const tournament = await firstUnfinishedTournament(db, request);
  if (tournament === null) return null;
  return { tournament, facts: await loadTournamentFacts(db, tournament) };
}
