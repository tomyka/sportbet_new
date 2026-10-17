import { leagueExists, saveDetails } from '@sportbet/db/league';
import { getDb } from '../../../../server/db';
import { leagueWorld } from '../../../../server/leagues/league-world';
import { answerDetailsSave } from '../../../../server/leagues/save-details';

interface Context {
  readonly params: Promise<{ league: string }>;
}

/** LeaguePaymentController::updateDetails (sportbet's URL and method): answered by answerDetailsSave (server/leagues/save-details.ts). */
export async function POST(
  request: Request,
  { params }: Context,
): Promise<Response> {
  return answerDetailsSave(
    request,
    {
      ...leagueWorld(),
      leagueExists: (league) => leagueExists(getDb(), league),
      save: (save) => saveDetails(getDb(), save),
    },
    (await params).league,
  );
}
