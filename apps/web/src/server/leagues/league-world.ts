import { cookies } from 'next/headers';
import { env } from '../../env';
import { now } from '../clock';
import { writeFlash } from '../flash';
import { signedInPlayer } from '../request-context';
import type { LeagueWorld } from './league-action';

/** The session and the one-time message, as every league route handler gets them. */
export function leagueWorld(): LeagueWorld {
  return {
    signedIn: signedInPlayer,
    leaveMessage: async (message) => {
      writeFlash(
        await cookies(),
        { kind: 'league', message },
        now(),
        env().AUTH_SECRET,
      );
    },
  };
}
