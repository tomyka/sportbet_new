import {
  ADMIN_PAYMENTS_DOOR,
  adminDetailsWorld,
} from '../../../../../server/admin/league-payments';
import { answerDetailsSave } from '../../../../../server/leagues/save-details';

interface Context {
  readonly params: Promise<{ league: string }>;
}

/** LeaguePaymentController::adminUpdateDetails: the details form (answerDetailsSave) behind the superadmin gate, writing as a superadmin of the working tournament. */
export async function POST(
  request: Request,
  { params }: Context,
): Promise<Response> {
  return answerDetailsSave(
    request,
    adminDetailsWorld(),
    (await params).league,
    ADMIN_PAYMENTS_DOOR,
  );
}
