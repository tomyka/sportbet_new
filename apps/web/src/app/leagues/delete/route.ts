import { removeLeague } from '@sportbet/db/league';
import { getDb } from '../../../server/db';
import { answerDelete } from '../../../server/leagues/delete-league';
import { leagueWorld } from '../../../server/leagues/league-world';

/** LeagueController::deleteLeague (sportbet's URL and method): answered by answerDelete (server/leagues/delete-league.ts). */
export function POST(request: Request): Promise<Response> {
  return answerDelete(request, {
    ...leagueWorld(),
    remove: (remove) => removeLeague(getDb(), remove),
  });
}
