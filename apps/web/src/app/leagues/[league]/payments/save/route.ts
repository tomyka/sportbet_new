import { leagueExists, savePayments } from '@sportbet/db/league';
import { ruledRules } from '@sportbet/domain';
import { getDb } from '../../../../../server/db';
import { leagueWorld } from '../../../../../server/leagues/league-world';
import { answerPaymentsSave } from '../../../../../server/leagues/save-payments';

interface Context {
  readonly params: Promise<{ league: string }>;
}

/**
 * LeaguePaymentController::update (sportbet posts to the payments page's
 * own address; Next cannot serve a page and a handler at one path): answered
 * by answerPaymentsSave (server/leagues/save-payments.ts).
 */
export async function POST(
  request: Request,
  { params }: Context,
): Promise<Response> {
  return answerPaymentsSave(
    request,
    {
      ...leagueWorld(),
      leagueExists: (league) => leagueExists(getDb(), league),
      save: (save) => savePayments(getDb(), { ...save, rules: ruledRules }),
    },
    (await params).league,
  );
}
