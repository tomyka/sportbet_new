import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../../server/admin/admin-action';
import { markMemberGuest } from '../../../../server/admin/leagues';

/**
 * R-87 (new; sportbet has no screen that sets `is_guest`), for a superadmin:
 * the "Svečias" switch on a league's members list, answering a 303 with a
 * message.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, markMemberGuest);
}
