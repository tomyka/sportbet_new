import { answerAdminPost } from '../../../server/admin/admin-action';
import { deleteUserPermission } from '../../../server/admin/confirm/delete-user';
import { askToDeleteUser } from '../../../server/admin/users';

/**
 * UserController::deleteUser (sportbet's URL and method), for a superadmin
 * (R-26 amended): only the first step - askToDeleteUser checks the account
 * may be deleted now and asks for the emailed code; nothing is deleted here.
 * The delete is /admin/confirm/save's.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, deleteUserPermission, askToDeleteUser);
}
