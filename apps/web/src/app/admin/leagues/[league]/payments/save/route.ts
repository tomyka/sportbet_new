import {
  ADMIN_PAYMENTS_DOOR,
  adminPaymentsWorld,
} from '../../../../../../server/admin/league-payments';
import { answerPaymentsSave } from '../../../../../../server/leagues/save-payments';

interface Context {
  readonly params: Promise<{ league: string }>;
}

/**
 * LeaguePaymentController::adminUpdate (the superadmin's door to any
 * league's payments, the public league's included): the league admin's own
 * save (answerPaymentsSave) behind the superadmin gate, writing as a
 * superadmin of the working tournament.
 */
export async function POST(
  request: Request,
  { params }: Context,
): Promise<Response> {
  return answerPaymentsSave(
    request,
    adminPaymentsWorld(),
    (await params).league,
    ADMIN_PAYMENTS_DOOR,
  );
}
