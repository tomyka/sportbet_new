import type {
  CompareRefusal,
  Comparison,
  PlayerId,
  Result,
} from '@sportbet/domain';
import {
  compareIdOf,
  isRouteUserId,
  otherPlayerOf,
} from '../../components/compare/compare-address';
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

/** What a compare request comes to, before the page or the card turns it into its own answer. */
export type CompareAnswer =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'guest' }
  | { readonly kind: 'no-tournament' }
  | { readonly kind: 'self' }
  | { readonly kind: 'comparison'; readonly comparison: Comparison };

/**
 * CompareController::show's decisions in its order, shared by the page and
 * the card the league table's modal loads: a userID that is not all digits
 * is a 404 for everyone (the route's constraint); a guest is for sign-in;
 * digits that are no id are a 404; a player in no tournament has no table;
 * oneself, and a player outside the listed players (R-73, a 404).
 */
export async function answerCompare(
  userID: string,
  request: {
    readonly signedIn: boolean;
    readonly inTournament: boolean;
    readonly load: (
      other: PlayerId,
    ) => Promise<Result<Comparison, CompareRefusal>>;
  },
): Promise<CompareAnswer> {
  if (!isRouteUserId(userID)) return { kind: 'not-found' };
  if (!request.signedIn) return { kind: 'guest' };
  const other = otherPlayerOf(userID);
  if (!other.ok) return { kind: 'not-found' };
  if (!request.inTournament) return { kind: 'no-tournament' };
  const result = await request.load(other.value);
  if (result.ok) return { kind: 'comparison', comparison: result.value };
  return result.refusal === 'self' ? { kind: 'self' } : { kind: 'not-found' };
}
