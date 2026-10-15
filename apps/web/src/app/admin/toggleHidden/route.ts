import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../server/admin/admin-action';
import { toggleHidden } from '../../../server/admin/users';

/**
 * UserController::toggleHidden (sportbet's URL and method), for a superadmin
 * (R-26 amended), as a form post answering a 303 with a message (sportbet's
 * answer was JSON): the account's hide in the tournament the admin works on
 * (R-19, R-115), toggled by toggleHidden.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, toggleHidden);
}
