import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../../server/admin/admin-action';
import { saveRound } from '../../../../server/admin/rounds';

/**
 * EventController::updateEvent (sportbet posts to `/admin/events`, the
 * page's own address; Next cannot serve both there), for a superadmin
 * (R-26 amended): a round's row changed, or deleted when `delete` is
 * posted; answered by saveRound, a 303 with the message.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, saveRound);
}
