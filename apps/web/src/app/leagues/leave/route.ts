import { exitLeague } from '@sportbet/db/league';
import { getDb } from '../../../server/db';
import { leagueWorld } from '../../../server/leagues/league-world';
import { answerLeave } from '../../../server/leagues/leave-league';

/** LeagueController::leaveLeague (sportbet's URL and method): answered by answerLeave (server/leagues/leave-league.ts), under the ruled rules (R-29). */
export function POST(request: Request): Promise<Response> {
  return answerLeave(request, {
    ...leagueWorld(),
    exit: (exit) => exitLeague(getDb(), exit),
  });
}
