import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../server/admin/admin-action';
import { changeGame } from '../../../server/admin/games';

/**
 * GameController::updateGame (sportbet's URL and method), for a superadmin
 * (R-26 amended): answered by changeGame, a 303 with the message.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, changeGame);
}
