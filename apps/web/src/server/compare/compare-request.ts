import type { CompareRefusal, Comparison, Result } from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { compareIdOf } from '../../components/compare/compare-address';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import { signInAndReturn } from '../sign-in/guarded-pages';

/**
 * Where a guest goes from a compare URL the route accepts: sign in, and come
 * back to it. Digits that are no id (0, 007, beyond the integer) reach the
 * `auth` middleware in sportbet all the same, but are no page to return to
 * (guardedReturnPath), so sign-in ends at home.
 */
export function guestSignInFor(userID: string): string {
  const id = compareIdOf(userID);
  return id === null ? '/login' : signInAndReturn('compare', id);
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
