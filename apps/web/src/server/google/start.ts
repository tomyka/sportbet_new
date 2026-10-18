import { googleStartLimits, type Instant } from '@sportbet/domain';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import type { ThrottleVerdict } from '../sign-in/throttle';
import type { GoogleAnswer } from './complete';
import { challengeOf, newNonce, newState, newVerifier } from './pkce';
import type { OAuthProvider } from './provider';

/** What the start needs of the world. */
export interface StartWorld {
  /** Whether a live session already names a player. */
  readonly signedIn: () => Promise<boolean>;
  /** The provider the settings name, or null when Google is not configured (the problem is already logged by name). */
  readonly provider: () => OAuthProvider | null;
  readonly throttle: (
    limits: ReturnType<typeof googleStartLimits>,
    at: Instant,
  ) => Promise<ThrottleVerdict>;
  /** Seals the trip into this browser's cookie. */
  readonly mintTrip: (trip: {
    readonly state: string;
    readonly nonce: string;
    readonly verifier: string;
  }) => void;
  /** The outcome's kind only. */
  readonly log: (outcome: string) => void;
}

/**
 * GET /auth/google (GoogleAuthController::redirectToGoogle): a signed-in
 * visitor is sent home before anything is minted (sportbet's `guest`
 * middleware); Google not configured, or too many starts from this address,
 * is the failure message (never a 429 page); else a new `state`, `nonce` and
 * PKCE verifier are sealed into this browser's cookie and the browser is sent
 * to the provider with the three values (the verifier only as its challenge).
 */
export async function startGoogle(
  world: StartWorld,
  request: { readonly ip: string; readonly at: Instant },
): Promise<GoogleAnswer> {
  if (await world.signedIn()) return { to: PLAYER_HOME, flash: null };
  const provider = world.provider();
  const failed: GoogleAnswer = { to: '/', flash: { kind: 'google-failed' } };
  if (provider === null) {
    world.log('refused-not-configured');
    return failed;
  }
  const verdict = await world.throttle(
    googleStartLimits(request.ip),
    request.at,
  );
  if (!verdict.allowed) {
    world.log('refused-throttled');
    return failed;
  }
  const trip = {
    state: newState(),
    nonce: newNonce(),
    verifier: newVerifier(),
  };
  world.mintTrip(trip);
  world.log('started');
  return {
    to: provider.authorizationUrl({
      state: trip.state,
      nonce: trip.nonce,
      challenge: challengeOf(trip.verifier),
    }),
    flash: null,
  };
}
