import { answerAdminPost } from '../../../server/admin/admin-action';
import { changeRolePermission } from '../../../server/admin/confirm/change-role';
import { askToChangeRole } from '../../../server/admin/users';

/**
 * UserController::updateUser (sportbet's URL and method), for a superadmin
 * (R-26 amended): only the first step - askToChangeRole checks the form and
 * that the domain allows the change, and asks for the emailed code; nothing
 * is written here. The change is /admin/confirm/save's.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, changeRolePermission, askToChangeRole);
}
