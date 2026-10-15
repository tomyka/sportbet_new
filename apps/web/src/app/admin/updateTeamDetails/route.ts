import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../server/admin/admin-action';
import { renameTeamFromForm } from '../../../server/admin/teams';

/**
 * TeamController::updateTeamDetails (sportbet's URL and method), for a
 * superadmin (R-26 amended): answered by renameTeamFromForm, a 303 with
 * the message.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, renameTeamFromForm);
}
