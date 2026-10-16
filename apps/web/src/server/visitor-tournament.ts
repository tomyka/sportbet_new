import {
  findVisitorTournament,
  loadTournamentFacts,
  type TournamentFacts,
} from '@sportbet/db';
import { ruledRules, type Tournament } from '@sportbet/domain';
import { now } from './clock';
import { getDb } from './db';
import { requestContext } from './request-context';
import { hubViewer } from './viewer';

/** The tournament /rules and /help describe, with its facts (R-106, R-128). */
export interface DescribedTournament {
  readonly tournament: Tournament;
  readonly facts: TournamentFacts;
}

/**
 * Tournament::forVisitor: the request's tournament for a player (R-28,
 * R-46), else the first hub card not yet finished that the viewer may see
 * (a guest's, or a player's with none): the one place the two pages choose
 * the tournament they describe. Either way the facts are
 * `loadTournamentFacts`'. Null with no tournament at all.
 */
export async function describedTournament(): Promise<DescribedTournament | null> {
  const db = getDb();
  const context = await requestContext();
  if (context.tournament !== null) {
    const { tournament } = context.tournament;
    return { tournament, facts: await loadTournamentFacts(db, tournament) };
  }
  return findVisitorTournament(db, {
    viewer: await hubViewer(),
    now: now(),
    rules: ruledRules,
  });
}
