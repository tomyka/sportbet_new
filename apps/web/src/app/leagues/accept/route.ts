import { joinFromInvite } from '@sportbet/db/league';
import { getDb } from '../../../server/db';
import { answerAccept } from '../../../server/leagues/answer-invite';
import { leagueWorld } from '../../../server/leagues/league-world';

/** LeagueController::acceptInvite (sportbet's URL and method): answered by answerAccept (server/leagues/answer-invite.ts). */
export function POST(request: Request): Promise<Response> {
  return answerAccept(request, {
    ...leagueWorld(),
    join: (join) => joinFromInvite(getDb(), join),
  });
}
