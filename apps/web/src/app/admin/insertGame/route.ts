import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../server/admin/admin-action';
import { addGame } from '../../../server/admin/games';

/**
 * GameController::insertGame (sportbet's URL and method), for a superadmin
 * (R-26 amended): answered by addGame, a 303 with the message.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, addGame);
}
