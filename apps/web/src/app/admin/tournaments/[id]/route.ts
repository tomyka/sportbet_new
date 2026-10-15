import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../../server/admin/admin-action';
import { changeTournament } from '../../../../server/admin/tournaments';

/**
 * TournamentController::adminUpdate (sportbet's URL and method), for a
 * superadmin (R-26 amended): answered by changeTournament, a 303 with the
 * message.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return answerAdminPost(request, isSuperadmin, (input) =>
    changeTournament(input, id),
  );
}
