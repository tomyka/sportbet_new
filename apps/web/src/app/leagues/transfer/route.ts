import { handOverLeague } from '@sportbet/db';
import { getDb } from '../../../server/db';
import { leagueWorld } from '../../../server/leagues/league-world';
import { answerTransfer } from '../../../server/leagues/transfer-league';

/** `/leagues/transfer` (R-23, R-119; new, sportbet has none): answered by answerTransfer (server/leagues/transfer-league.ts). */
export function POST(request: Request): Promise<Response> {
  return answerTransfer(request, {
    ...leagueWorld(),
    handOver: (hand) => handOverLeague(getDb(), hand),
  });
}
