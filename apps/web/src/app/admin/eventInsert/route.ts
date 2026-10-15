import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../server/admin/admin-action';
import { addRound } from '../../../server/admin/rounds';

/**
 * EventController::insertEvent (sportbet's URL and method), for a
 * superadmin (R-26 amended): answered by addRound, a 303 with the message.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, addRound);
}
