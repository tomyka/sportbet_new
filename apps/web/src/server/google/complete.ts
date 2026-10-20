import {
  googleCallbackLimits,
  googleSignInPlan,
  type EmailAddress,
  type GoogleId,
  type GoogleIdentity,
  type Instant,
  type PlayerId,
  type Result,
} from '@sportbet/domain';
import type { GoogleLinkRefusal } from '@sportbet/db/account';
import { timingSafeEqual } from 'node:crypto';
import type { Flash } from '../flash';
import type { ThrottleVerdict } from '../sign-in/throttle';
import type { CodeExchange } from './provider';
import type { PendingGoogle } from './pending';

/** How the callback ends: where the browser goes, and the one-time message to leave on the way. */
export interface GoogleAnswer {
  readonly to: string;
  readonly flash: Flash | null;
}

/** What the callback reads of the request: only the query, the client's address and the moment. */
export interface GoogleCallback {
  readonly error: string | null;
  readonly code: string | null;
  readonly state: string | null;
  readonly ip: string;
  readonly at: Instant;
}

/** What the callback needs of the world, so the order of its steps is tested with fakes. */
export interface GoogleWorld {
  readonly throttle: (
    limits: ReturnType<typeof googleCallbackLimits>,
    at: Instant,
  ) => Promise<ThrottleVerdict>;
  /** This browser's trip, if its cookie is one this app sealed and is fresh. */
  readonly trip: (at: Instant) => PendingGoogle | null;
  /** Forgets the trip, with the cookie's own flags. */
  readonly forgetTrip: () => void;
  readonly exchange: (
    exchange: CodeExchange,
  ) => Promise<Result<GoogleIdentity, 'failed'>>;
  readonly findBySub: (
    sub: GoogleId,
  ) => Promise<{ readonly player: PlayerId } | undefined>;
  /** The account with exactly this address (#41). */
  readonly findByEmail: (
    email: EmailAddress,
  ) => Promise<{ readonly player: PlayerId } | undefined>;
  readonly registrationOpen: (at: Instant) => Promise<boolean>;
  /** linkGoogleId: one statement, never an overwrite. */
  readonly link: (
    player: PlayerId,
    sub: GoogleId,
  ) => Promise<Result<'linked', GoogleLinkRefusal>>;
  /** createAccount's Google door: `taken`, or the new player; a throw is a failure. */
  readonly register: (
    sub: GoogleId,
    email: EmailAddress,
    name: string | null,
    at: Instant,
  ) => Promise<Result<NewGoogleAccount, 'taken'>>;
  /** A new session, the audit row, and where to go: the guarded page kept, or home. */
  readonly signIn: (
    player: PlayerId,
    method: 'google' | 'register_google',
    at: Instant,
  ) => Promise<string>;
  /** After an account was made: the derived points expire when createAccount says so, the intended tournament is forgotten. */
  readonly registered: (created: NewGoogleAccount) => void;
  /** The outcome's kind only: never a code, a token, a sub, an address or a name. */
  readonly log: (outcome: string) => void;
  /** A failure by its kind, never its message. */
  readonly logError: (error: unknown) => void;
}

/** The account createAccount made, and whether it joined a tournament (BoardEffect). */
interface NewGoogleAccount {
  readonly player: PlayerId;
  readonly boardChanged: boolean;
}

const FAILED: GoogleAnswer = { to: '/', flash: { kind: 'google-failed' } };

const refused = (
  world: GoogleWorld,
  outcome: string,
  answer: GoogleAnswer = FAILED,
): GoogleAnswer => {
  world.log(outcome);
  return answer;
};

/** An authorization code as Google writes one: URL-safe characters, at most 2 KB. */
const CODE = /^[A-Za-z0-9._~/+=-]{1,2048}$/;

/** `state`, compared in constant time; unequal lengths are unequal. */
function sameState(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The trip checked, and only then the code exchanged: the cookie, its
 * purpose, its age and `state` are valid, or nothing is asked of Google. The
 * cookie is forgotten from here on, whatever follows.
 */
async function identityOf(
  world: GoogleWorld,
  request: GoogleCallback,
): Promise<Result<GoogleIdentity, 'request' | 'state' | 'exchange'>> {
  const { error, code, state, at } = request;
  const trip = world.trip(at);
  world.forgetTrip();
  if (error !== null || code === null || !CODE.test(code)) {
    return { ok: false, refusal: 'request' };
  }
  if (trip === null || state === null || !sameState(state, trip.state)) {
    return { ok: false, refusal: 'state' };
  }
  const identity = await world.exchange({
    code,
    verifier: trip.verifier,
    nonce: trip.nonce,
  });
  return identity.ok ? identity : { ok: false, refusal: 'exchange' };
}

/** Makes the account (sportbet's creation: `taken` is "failed", any other failure is "registration failed") and signs it in. */
async function register(
  world: GoogleWorld,
  identity: GoogleIdentity,
  at: Instant,
): Promise<GoogleAnswer> {
  if (identity.email === null) return refused(world, 'refused-no-address');
  let created: Result<NewGoogleAccount, 'taken'>;
  try {
    created = await world.register(
      identity.sub,
      identity.email,
      identity.name,
      at,
    );
  } catch (error) {
    world.logError(error);
    return refused(world, 'failed-registration', {
      to: '/',
      flash: { kind: 'google-registration-failed' },
    });
  }
  if (!created.ok) return refused(world, 'refused-taken');
  world.registered(created.value);
  world.log('registered');
  return {
    to: await world.signIn(created.value.player, 'register_google', at),
    flash: null,
  };
}

/** The account Google's address is exactly the address of, linked to this `sub` and signed in; a link that refuses signs nobody in (R-135). */
async function link(
  world: GoogleWorld,
  identity: GoogleIdentity,
  player: PlayerId,
  at: Instant,
): Promise<GoogleAnswer> {
  const linked = await world.link(player, identity.sub);
  if (!linked.ok) return refused(world, `refused-link-${linked.refusal}`);
  world.log('linked');
  return { to: await world.signIn(player, 'google', at), flash: null };
}

/** The plan, then what it says. */
async function act(
  world: GoogleWorld,
  identity: GoogleIdentity,
  at: Instant,
): Promise<GoogleAnswer> {
  const plan = googleSignInPlan({
    identity,
    bySub: (await world.findBySub(identity.sub)) ?? null,
    byEmail:
      identity.email === null
        ? null
        : ((await world.findByEmail(identity.email)) ?? null),
    registrationOpen: await world.registrationOpen(at),
  });
  if (!plan.ok) {
    // Registration closed (R-128, R-135 Q4): home, no message, as sportbet.
    return plan.refusal === 'unverified'
      ? refused(world, 'refused-unverified', {
          to: '/',
          flash: { kind: 'google-unverified' },
        })
      : refused(world, 'refused-closed', { to: '/', flash: null });
  }
  const { value } = plan;
  if (value.kind === 'register') return register(world, identity, at);
  if (value.kind === 'link') return link(world, identity, value.player, at);
  world.log('signed-in');
  return { to: await world.signIn(value.player, 'google', at), flash: null };
}

/**
 * GoogleAuthController::handleGoogleCallback (slice 19, #40), in this order:
 * throttled by the client's address first (the exchange is an outbound
 * request); then a denied consent or a code that is missing or no code; then
 * this browser's trip - its cookie and `state` - and only then the exchange;
 * then the plan: by `sub`, by a verified address, or a new account while
 * registration is open. Every refusal is sportbet's own message (or, for a
 * closed registration, none) and signs nobody in; the trip's cookie is
 * forgotten on every outcome, so a replayed callback finds nothing. An error
 * anywhere is the failure message, never an error page.
 */
export async function completeGoogle(
  world: GoogleWorld,
  request: GoogleCallback,
): Promise<GoogleAnswer> {
  try {
    const verdict = await world.throttle(
      googleCallbackLimits(request.ip),
      request.at,
    );
    if (!verdict.allowed) {
      world.forgetTrip();
      return refused(world, 'refused-throttled');
    }
    const identity = await identityOf(world, request);
    if (!identity.ok) return refused(world, `refused-${identity.refusal}`);
    return await act(world, identity.value, request.at);
  } catch (error) {
    world.forgetTrip();
    world.logError(error);
    return refused(world, 'error');
  }
}
