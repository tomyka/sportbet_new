import { loadPaymentsPage } from '@sportbet/db';
import { ruledRules, type LeagueId, type PlayerId } from '@sportbet/domain';
import { getDb } from '../../server/db';

/**
 * Whether the league is there, for the payments handlers' 404 that comes
 * before a refused form's 422: any answer of the page's loader but its own
 * "no such league" proves it (a refusal of the actor is an existing league).
 */
export async function leagueExists(check: {
  readonly actor: PlayerId;
  readonly league: LeagueId;
}): Promise<boolean> {
  const found = await loadPaymentsPage(getDb(), {
    ...check,
    rules: ruledRules,
  });
  return found.ok || found.refusal !== 'no-such-league';
}
