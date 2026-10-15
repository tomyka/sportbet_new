import type {
  LeagueId,
  PaymentsPage,
  PaymentsRefusal,
  PlayerId,
  Result,
} from '@sportbet/domain';
import { signInAndReturn } from '../sign-in/guarded-pages';
import { asLeague } from './id-field';
import { readLeagueSegment } from './league-segment';

/** What opening the payments page needs of the world: who is signed in, and the page's data. */
export interface OpenPaymentsWorld {
  readonly signedIn: () => Promise<{ readonly player: PlayerId } | null>;
  readonly load: (query: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
  }) => Promise<Result<PaymentsPage, PaymentsRefusal | 'no-such-league'>>;
}

/** What the payments route does: draw the page, answer 404, or go elsewhere. */
export type OpenedPayments =
  | { readonly kind: 'page'; readonly page: PaymentsPage }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'redirect'; readonly to: string };

/**
 * LeaguePaymentController::edit, behind sportbet's `auth`: a guest goes to
 * sign in and comes back here (to plain /login when the segment is no
 * league); a league that is not there is a 404; the public league and a
 * league the player does not administer are sportbet's 403 - a page cannot
 * answer one, so the visit goes home with no message (the handlers keep the
 * real 403); else the league's payments.
 */
export async function openPayments(
  segment: string,
  world: OpenPaymentsWorld,
): Promise<OpenedPayments> {
  const id = readLeagueSegment(segment);
  const signedIn = await world.signedIn();
  if (signedIn === null) {
    return {
      kind: 'redirect',
      to: id === null ? '/login' : signInAndReturn('leaguePayments', id),
    };
  }
  if (id === null) return { kind: 'not-found' };
  const loaded = await world.load({
    actor: signedIn.player,
    league: asLeague(id),
  });
  if (loaded.ok) return { kind: 'page', page: loaded.value };
  return loaded.refusal === 'no-such-league'
    ? { kind: 'not-found' }
    : { kind: 'redirect', to: '/' };
}
