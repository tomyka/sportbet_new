import { selectLeague } from '@sportbet/db';
import { cookies } from 'next/headers';
import { env } from '../../../env';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { writeFlash } from '../../../server/flash';
import { answerSwitch } from '../../../server/leagues/switch-league';
import { signedInPlayer } from '../../../server/request-context';

/**
 * LeagueController::switchLeague ("Lyga" in the switcher, at sportbet's URL
 * and method): answered by answerSwitch (server/leagues/switch-league.ts).
 */
export function POST(request: Request): Promise<Response> {
  return answerSwitch(request, {
    signedIn: signedInPlayer,
    select: (select) => selectLeague(getDb(), select),
    leaveMessage: async () => {
      writeFlash(
        await cookies(),
        { kind: 'league-switched' },
        now(),
        env().AUTH_SECRET,
      );
    },
  });
}
