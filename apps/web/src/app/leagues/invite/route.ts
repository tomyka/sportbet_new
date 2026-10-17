import { isLeagueAdmin, sendLeagueInvite } from '@sportbet/db/league';
import { getDb } from '../../../server/db';
import { answerInvite } from '../../../server/leagues/invite-player';
import { leagueWorld } from '../../../server/leagues/league-world';

/** LeagueController::invite (sportbet's URL and method): answered by answerInvite (server/leagues/invite-player.ts). */
export function POST(request: Request): Promise<Response> {
  return answerInvite(request, {
    ...leagueWorld(),
    isAdmin: (check) => isLeagueAdmin(getDb(), check),
    invite: (send) => sendLeagueInvite(getDb(), send),
  });
}
