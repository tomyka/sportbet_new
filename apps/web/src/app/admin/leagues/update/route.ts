import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../../server/admin/admin-action';
import { editLeague } from '../../../../server/admin/leagues';

/**
 * LeagueController::adminUpdate (sportbet's URL and method), for a superadmin
 * (R-26 amended, R-105): a league of the tournament they work on, edited
 * with the owner's own form.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, editLeague);
}
