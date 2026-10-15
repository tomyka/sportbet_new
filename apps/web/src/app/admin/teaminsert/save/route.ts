import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../../server/admin/admin-action';
import { addPlaceholderTeams } from '../../../../server/admin/teams';

/**
 * TeamController::insertTeams (sportbet posts to `/admin/teaminsert`, the
 * page's own address), for a superadmin (R-26 amended): answered by
 * addPlaceholderTeams, a 303 with the message.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, addPlaceholderTeams);
}
