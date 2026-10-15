import { answerAdminPost } from '../../../../server/admin/admin-action';
import { deleteLeaguePermission } from '../../../../server/admin/confirm/delete-league';
import { askToDeleteLeague } from '../../../../server/admin/leagues';

/**
 * LeagueController::adminDelete (sportbet's URL and method), for a
 * superadmin (R-26 amended): only the first step - askToDeleteLeague checks
 * the league may be deleted now and asks for the emailed code (R-118);
 * nothing is deleted here. The delete is /admin/confirm/save's.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, deleteLeaguePermission, askToDeleteLeague);
}
