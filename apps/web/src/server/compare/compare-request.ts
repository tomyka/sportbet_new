import {
  idFromText,
  playerId,
  type CompareRefusal,
  type Comparison,
  type IdTextRefusal,
  type PlayerId,
  type Result,
} from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import { signInAndReturn } from '../sign-in/guarded-pages';

/**
 * sportbet's route constraint `where('userID', '[0-9]+')`: any other userID
 * matches no route, so it is a 404 for a guest as for a player.
 */
export const isRouteUserId = (userID: string): boolean =>
  /^[0-9]+$/u.test(userID);

/**
 * Where a guest goes from a compare URL the route accepts: sign in, and come
 * back to it. Digits that are no id (0, 007, beyond the integer) reach the
 * `auth` middleware in sportbet all the same, but are no page to return to
 * (guardedReturnPath), so sign-in ends at home.
 */
export function guestSignInFor(userID: string): string {
  const other = otherPlayerOf(userID);
  return other.ok ? signInAndReturn('compare', Number(other.value)) : '/login';
}

/**
 * The player a compare URL names: its userID read as every id typed into a
 * URL is (idFromText: digits, no leading 0, within Postgres' integer).
 */
export function otherPlayerOf(
  userID: string,
): Result<PlayerId, IdTextRefusal | 'empty'> {
  const typed = idFromText(userID);
  return typed.ok ? playerId(String(typed.value)) : typed;
}

/**
 * The comparison, or the way sportbet's CompareController leaves: oneself
 * goes to the game page, and a player outside the tournament's listed
 * players is a 404.
 */
export function comparisonOrLeave(
  result: Result<Comparison, CompareRefusal>,
): Comparison {
  if (result.ok) return result.value;
  if (result.refusal === 'self') redirect(PLAYER_HOME);
  notFound();
}
