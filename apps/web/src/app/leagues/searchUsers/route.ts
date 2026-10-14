import { isLeagueAdmin, searchPlayers } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { signedInPlayer } from '../../../server/request-context';
import { answerSearch } from '../../../server/leagues/search-players';
import { throttle } from '../../../server/sign-in/throttle';

/**
 * LeagueController::searchUsers (sportbet's URL, a GET answering JSON):
 * answered by answerSearch (server/leagues/search-players.ts), under the
 * ruled rules (R-88).
 */
export function GET(request: Request): Promise<Response> {
  return answerSearch(request, {
    signedIn: signedInPlayer,
    rules: ruledRules,
    now,
    throttle: (limits, at) => throttle(getDb(), limits, at),
    isAdmin: (check) => isLeagueAdmin(getDb(), check),
    search: (search) => searchPlayers(getDb(), search),
  });
}
