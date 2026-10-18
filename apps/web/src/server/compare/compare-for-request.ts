import { loadCompare } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { getDb } from '../../server/db';
import { requestContext } from '../../server/request-context';
import { answerCompare, type CompareAnswer } from './compare-request';

/** The compare request of the signed-in player (or guest) making this request, answered. */
export async function compareForRequest(
  userID: string,
): Promise<CompareAnswer> {
  const context = await requestContext();
  const { player, tournament } = context;
  return answerCompare(userID, {
    signedIn: player !== null,
    inTournament: tournament !== null,
    load: (other) => {
      if (player === null || tournament === null) {
        throw new Error('compare loaded for a request with no tournament');
      }
      return loadCompare(getDb(), {
        viewer: player.id,
        other,
        tournament: tournament.tournament,
        rules: ruledRules,
      });
    },
  });
}
