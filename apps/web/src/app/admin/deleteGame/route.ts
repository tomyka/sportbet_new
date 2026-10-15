import { answerAdminPost } from '../../../server/admin/admin-action';
import { deleteGamePermission } from '../../../server/admin/confirm/delete-game';
import { askToDeleteGame } from '../../../server/admin/games';

/**
 * GameController::deleteGame (sportbet's URL and method), for a superadmin
 * (R-26 amended): only the first step - askToDeleteGame checks the game
 * may be deleted now and asks for the emailed code; nothing is deleted
 * here. The delete is /admin/confirm/save's.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, deleteGamePermission, askToDeleteGame);
}
