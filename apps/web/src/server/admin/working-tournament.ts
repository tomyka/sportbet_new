import { loadAdminTournament } from '@sportbet/db/tournament';
import type { PlayerId, Tournament } from '@sportbet/domain';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { requestContext } from '../request-context';

/**
 * The tournament the admin works on at /admin/events, /admin/games and
 * /admin/teams: the one they chose with "Dirbti šiame turnyre" (stored
 * with the account), else the request's (R-28, as sportbet's session
 * held it); null when neither exists - the pages then say so, and a write
 * is refused ("Nepasirinktas turnyras. ...").
 */
export async function workingTournament(
  player: PlayerId,
): Promise<Tournament | null> {
  const chosen = await loadAdminTournament(getDb(), player);
  return chosen ?? (await requestContext()).tournament?.tournament ?? null;
}
