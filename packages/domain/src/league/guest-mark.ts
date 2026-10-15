import { ok, refuse, type Result } from '../shared/result';
import type { LeagueMember } from './league';

/** `not-member`: the player is no member of the league; `unchanged`: already marked so. */
export type GuestMarkRefusal = 'not-member' | 'unchanged';

/**
 * R-87: a superadmin marks a league member a guest (sees and is seen by
 * everyone) or a full member again. sportbet had the flag and no screen to
 * set it, so there is no sportbet rule to follow: any member of any league
 * may be marked, and a mark that changes nothing is refused. The roster
 * narrows at once; no points change.
 */
export function markGuest(
  member: Pick<LeagueMember, 'isGuest'> | null,
  guest: boolean,
): Result<{ readonly isGuest: boolean }, GuestMarkRefusal> {
  if (member === null) return refuse('not-member');
  if (member.isGuest === guest) return refuse('unchanged');
  return ok({ isGuest: guest });
}
