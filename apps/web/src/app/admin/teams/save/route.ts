import { mayEnterStandingsFacts } from '@sportbet/domain';
import { answerAdminPost } from '../../../../server/admin/admin-action';
import { saveFacts } from '../../../../server/admin/teams';

/**
 * TeamController::updateTeams (sportbet posts to `/admin/teams`, the
 * page's own address; Next cannot serve both there), for a role that may
 * enter the standings facts (R-26 amended): answered by saveFacts, a 303
 * with the message.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, mayEnterStandingsFacts, saveFacts);
}
