import { dropLeagueInvite } from '@sportbet/db';
import { getDb } from '../../../server/db';
import { answerDecline } from '../../../server/leagues/answer-invite';
import { leagueWorld } from '../../../server/leagues/league-world';

/** LeagueController::declineInvite (sportbet's URL and method): answered by answerDecline (server/leagues/answer-invite.ts). */
export function POST(request: Request): Promise<Response> {
  return answerDecline(request, {
    ...leagueWorld(),
    drop: (drop) => dropLeagueInvite(getDb(), drop),
  });
}
