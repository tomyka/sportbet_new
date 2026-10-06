import { setLastTournament } from '@sportbet/db';
import { getDb } from '../../../server/db';
import { signedInPlayer } from '../../../server/request-context';
import { seeOther } from '../../../server/request/route-responses';

/**
 * TournamentController::exit ("Keisti turnyrą"), at sportbet's URL and
 * method (a GET; answered with a 303, as every route that writes is): forgets the tournament the player used last (R-28) and
 * goes to the hub; the next page picks by R-46, as sportbet's next /main
 * re-picks. A guest just goes to the hub. The rail links it plainly, never
 * prefetched (rail-tournament.tsx).
 */
export async function GET(): Promise<Response> {
  const signedIn = await signedInPlayer();
  if (signedIn !== null) {
    await setLastTournament(getDb(), signedIn.player, null);
  }
  return seeOther('/');
}
