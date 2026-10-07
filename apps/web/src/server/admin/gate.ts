import type { SignedInPlayer } from '@sportbet/db';
import { mayEnterResults } from '@sportbet/domain';
import { signedInPlayer } from '../request-context';

/**
 * AdminMiddleware for R-26 (amended): the signed-in player if their role
 * may enter results and recalculate, else null. The role is read from the
 * database with the session on every request (sportbet re-reads
 * `user_settings.admin` in each middleware), never kept in a cookie. A
 * page answers null with `redirect('/')`, a route handler with
 * `seeOther('/')` (design decision 2).
 */
export async function resultsManager(): Promise<SignedInPlayer | null> {
  const signedIn = await signedInPlayer();
  return signedIn !== null && mayEnterResults(signedIn.role) ? signedIn : null;
}
