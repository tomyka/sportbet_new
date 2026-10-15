import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../../../server/admin/admin-action';
import { enterContext } from '../../../../../server/admin/tournaments';

/**
 * TournamentController::adminEnterContext (sportbet's URL and method), for
 * a superadmin (R-26 amended): "Dirbti šiame turnyre", answered by
 * enterContext, a 303 to the dashboard.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return answerAdminPost(request, isSuperadmin, (input) =>
    enterContext(input, id),
  );
}
