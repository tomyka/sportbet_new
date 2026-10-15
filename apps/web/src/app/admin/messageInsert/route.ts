import { mayEditMessages } from '@sportbet/domain';
import { answerAdminPost } from '../../../server/admin/admin-action';
import { addMessage } from '../../../server/admin/messages';

/** MessageController::insertMessage (sportbet's URL and method), for a results manager or a superadmin (R-116). */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, mayEditMessages, addMessage);
}
