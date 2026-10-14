import { foundLeague } from '@sportbet/db';
import { getDb } from '../../../server/db';
import { answerCreate } from '../../../server/leagues/create-league';
import { leagueWorld } from '../../../server/leagues/league-world';
import { requestContext } from '../../../server/request-context';

/**
 * LeagueController::create (sportbet's URL and method): answered by
 * answerCreate (server/leagues/create-league.ts), in the request's tournament.
 */
export function POST(request: Request): Promise<Response> {
  return answerCreate(request, {
    ...leagueWorld(),
    tournament: async () =>
      (await requestContext()).tournament?.tournament ?? null,
    found: (found) => foundLeague(getDb(), found),
  });
}
