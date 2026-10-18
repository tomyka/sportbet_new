import { usernameInvariant } from '../player/player';
import type { PlayerId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import { normalizeEmail, storedEmailAddress, type EmailAddress } from './email';
import { googleId, type GoogleId } from './google-id';
import { ANSWER_MAX_LENGTH } from './person-name';

/**
 * Who Google says is signing in: the `sub`, the address as the account
 * stores one (or null when Google gave none a stored address can be), whether
 * Google called it verified, and the display name.
 */
export interface GoogleIdentity {
  readonly sub: GoogleId;
  /** Normalized; null counts as unverified, as sportbet's missing claim does. */
  readonly email: EmailAddress | null;
  /** True only for the JSON boolean `true` ("true" and 1 are not). */
  readonly emailVerified: boolean;
  readonly name: string | null;
}

/**
 * The identity from the claims as they were parsed (`unknown`s): a `sub` that
 * is no GoogleId refuses; an address that is no address once normalized
 * (normalizeEmail) is null; `emailVerified` is exactly `true`; a name that is
 * not text is null.
 */
export function googleIdentity(claims: {
  readonly sub: unknown;
  readonly email: unknown;
  readonly emailVerified: unknown;
  readonly name: unknown;
}): Result<GoogleIdentity, 'invalid'> {
  const sub = googleId(claims.sub);
  if (!sub.ok) return refuse('invalid');
  const email =
    typeof claims.email === 'string'
      ? storedEmailAddress(normalizeEmail(claims.email))
      : null;
  return ok({
    sub: sub.value,
    email: email?.ok === true ? email.value : null,
    emailVerified: claims.emailVerified === true,
    name: typeof claims.name === 'string' ? claims.name : null,
  });
}

/** What the plan is told about the accounts that already exist. */
export interface GoogleSignInInput {
  readonly identity: GoogleIdentity;
  /** The account whose `google_id` is the identity's `sub`, if any. */
  readonly bySub: { readonly player: PlayerId } | null;
  /** The account whose address is exactly the identity's, if any. */
  readonly byEmail: { readonly player: PlayerId } | null;
  /** R-128: a tournament still takes players. */
  readonly registrationOpen: boolean;
}

export type GooglePlan =
  | { readonly kind: 'sign-in'; readonly player: PlayerId }
  | { readonly kind: 'link'; readonly player: PlayerId }
  | { readonly kind: 'register' };

export type GoogleRefusal = 'unverified' | 'registration-closed';

/**
 * GoogleAuthController::handleGoogleCallback's order (slice 19, #40): a `sub`
 * already linked signs in, asking nothing of the address (it was verified when
 * the link was made); else an address Google did not call verified - or none
 * - is refused, so nothing is linked or created on it; else the account with
 * exactly that address is linked and signs in (the link itself refuses a
 * different Google account already there, R-135); else, while registration is
 * open, an account is made, and when it is closed (R-128) the visitor is sent
 * home with no message. The folded spelling is not decided here: it is
 * createAccount's `taken`.
 */
export function googleSignInPlan(
  input: GoogleSignInInput,
): Result<GooglePlan, GoogleRefusal> {
  const { identity, bySub, byEmail, registrationOpen } = input;
  if (bySub !== null) return ok({ kind: 'sign-in', player: bySub.player });
  if (!identity.emailVerified || identity.email === null) {
    return refuse('unverified');
  }
  if (byEmail !== null) return ok({ kind: 'link', player: byEmail.player });
  if (!registrationOpen) return refuse('registration-closed');
  return ok({ kind: 'register' });
}

/** The word an address with no usable local part gets (sportbet's). */
const FALLBACK_USERNAME = 'zaidejas';

/** How many suffixes freeUsername tries (2 to 1000) before it gives up. */
export const GOOGLE_USERNAME_SUFFIX_LIMIT = 1000;

const characters = (text: string): string[] => Array.from(text);

/**
 * The username suggested by an address (freeUsernameFor): its local part, or
 * "zaidejas" when that is empty or no username (only characters the username
 * invariant refuses). Cut so that the longest suffix still fits 255.
 */
export function googleUsernameBase(email: string): string {
  const at = email.indexOf('@');
  const local = at === -1 ? email : email.slice(0, at);
  const room = ANSWER_MAX_LENGTH - String(GOOGLE_USERNAME_SUFFIX_LIMIT).length;
  const base = characters(local).slice(0, room).join('');
  return usernameInvariant.schema.safeParse(base).success
    ? base
    : FALLBACK_USERNAME;
}

/**
 * Google's `name` as a name and a surname: split on the first space, the rest
 * the surname; surrounding spaces trimmed, each part cut to 255 characters
 * (the column's limit, counted in characters).
 */
export function googleNameParts(name: string | null): [string, string] {
  const trimmed = (name ?? '').trim();
  const space = trimmed.indexOf(' ');
  const [first, rest] =
    space === -1
      ? [trimmed, '']
      : [trimmed.slice(0, space), trimmed.slice(space + 1)];
  const cut = (part: string) =>
    characters(part).slice(0, ANSWER_MAX_LENGTH).join('');
  return [cut(first), cut(rest)];
}

/**
 * The first username nobody holds: `base`, then `base2`, `base3`, ... up to
 * the suffix limit (freeUsernameFor). `isHeld` says whether an account holds
 * a candidate as the collation compares it. Refuses `exhausted` when every
 * candidate is held: an impossible state the caller turns into a throw.
 */
export function freeUsername(
  base: string,
  isHeld: (candidate: string) => boolean,
): Result<string, 'exhausted'> {
  if (!isHeld(base)) return ok(base);
  for (let suffix = 2; suffix <= GOOGLE_USERNAME_SUFFIX_LIMIT; suffix += 1) {
    const candidate = `${base}${String(suffix)}`;
    if (!isHeld(candidate)) return ok(candidate);
  }
  return refuse('exhausted');
}
