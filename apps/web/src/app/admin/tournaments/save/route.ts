import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../../server/admin/admin-action';
import { storeTournament } from '../../../../server/admin/tournaments';

/**
 * TournamentController::adminStore (sportbet posts to `/admin/tournaments`,
 * the page's own address; Next cannot serve both there), for a superadmin
 * (R-26 amended): answered by storeTournament, a 303 with the message.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, storeTournament);
}
