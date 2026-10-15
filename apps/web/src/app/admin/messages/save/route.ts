import { mayEditMessages } from '@sportbet/domain';
import { answerAdminPost } from '../../../../server/admin/admin-action';
import { saveMessage } from '../../../../server/admin/messages';

/**
 * MessageController::updateMessage (sportbet posts to `/admin/messages`; Next
 * cannot serve a page and a handler at one path), for a results manager or a
 * superadmin (R-116): `update` saves; `delete` is a superadmin's alone and
 * only asks for the emailed code (R-26 amended) - the refusal of a results
 * manager's delete is made inside saveMessage, before any mail.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, mayEditMessages, saveMessage);
}
