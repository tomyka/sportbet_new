import { editLeague, isLeagueAdmin } from '@sportbet/db/league';
import { getDb } from '../../../server/db';
import { leagueWorld } from '../../../server/leagues/league-world';
import { answerUpdate } from '../../../server/leagues/update-league';

/** LeagueController::update (sportbet's URL and method): answered by answerUpdate (server/leagues/update-league.ts). */
export function POST(request: Request): Promise<Response> {
  return answerUpdate(request, {
    ...leagueWorld(),
    isAdmin: (check) => isLeagueAdmin(getDb(), check),
    edit: (edit) => editLeague(getDb(), edit),
  });
}
