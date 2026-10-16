import type { Profile } from '@sportbet/db';
import {
  emailChangeVerifyLimits,
  type EmailAddress,
  type Instant,
  type PlayerId,
  type Result,
  type ThrottleLimit,
} from '@sportbet/domain';
import type { CodeCheck } from '../code-check';
import { formText } from '../request/form-input';
import type { ThrottleVerdict } from '../sign-in/throttle';
import {
  profileSaid,
  type ProfileAnswer,
  type ProfileRequest,
} from './profile-action';
import type { ProfileError } from './profile-messages';

/** What confirming an address change needs of the world. */
export interface EmailChangeWorld {
  readonly throttle: (
    limits: readonly ThrottleLimit[],
    at: Instant,
  ) => Promise<ThrottleVerdict>;
  readonly load: (player: PlayerId) => Promise<Profile | undefined>;
  /** The shared code check, purpose `email_change`, for the pending address. */
  readonly checkCode: (input: {
    readonly email: EmailAddress;
    readonly code: string;
    readonly now: Instant;
  }) => Promise<CodeCheck>;
  /** confirmEmailChange: the move itself, under the player row's lock. */
  readonly confirm: (
    player: PlayerId,
    pending: EmailAddress,
  ) => Promise<Result<{ readonly old: EmailAddress }, 'none' | 'taken'>>;
  /** The notice to the old address; a failure is logged by kind and never undoes the move. */
  readonly sendNotice: (old: EmailAddress, now: EmailAddress) => Promise<void>;
  readonly cancel: (player: PlayerId) => Promise<void>;
}

/** The confirmation's refusal, shown beside the code box (Laravel's `emailChange` bag). */
const codeRefused = (code: ProfileError): ProfileAnswer =>
  profileSaid({
    kind: 'profile-refused',
    bag: 'emailChange',
    errors: { code },
  });

/**
 * UserProfileController::confirmEmailChange (5 per 10 minutes per account,
 * 15 per IP, as route middleware: a refusal is Laravel's 429): an empty code
 * is wrong whatever is pending; nothing pending is `none`; a code that is
 * wrong, expired or of another purpose is `invalid` (the one answer of
 * checkCode, on the pending address); the address taken meanwhile is
 * `taken` (the code is spent, as sportbet); else the address moves and the
 * old one is told. The code is read from the body only, trimmed.
 */
export async function confirmAddressChange(
  { player, form, ip, at }: ProfileRequest,
  world: EmailChangeWorld,
): Promise<ProfileAnswer> {
  const verdict = await world.throttle(
    emailChangeVerifyLimits(player.player, ip),
    at,
  );
  if (!verdict.allowed) return { kind: 'throttled', minutes: verdict.minutes };
  const code = formText(form, 'code');
  if (code === '') return codeRefused('invalid');
  const profile = await world.load(player.player);
  const pending = profile?.pendingEmail ?? null;
  if (pending === null) return codeRefused('none');
  const checked = await world.checkCode({ email: pending, code, now: at });
  if (checked === 'refused') return codeRefused('invalid');
  const moved = await world.confirm(player.player, pending);
  if (!moved.ok) return codeRefused(moved.refusal);
  await world.sendNotice(moved.value.old, pending);
  return profileSaid({ kind: 'email-changed' });
}

/** UserProfileController::cancelEmailChange: drops a pending change and keeps the current address. */
export async function cancelAddressChange(
  { player }: ProfileRequest,
  world: Pick<EmailChangeWorld, 'cancel'>,
): Promise<ProfileAnswer> {
  await world.cancel(player.player);
  return profileSaid({ kind: 'email-change-cancelled' });
}
