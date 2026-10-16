import type { AccountDeleted, Profile } from '@sportbet/db';
import {
  deletionCodeRequestLimits,
  deletionVerifyLimits,
  type EmailAddress,
  type Instant,
  type PlayerId,
  type Result,
  type ThrottleLimit,
} from '@sportbet/domain';
import type { AccountDeleteRefusal } from '@sportbet/db';
import type { CodeCheck } from '../code-check';
import { formText } from '../request/form-input';
import type { ThrottleVerdict } from '../sign-in/throttle';
import {
  profileSaid,
  type ProfileAnswer,
  type ProfileRequest,
} from './profile-action';
import type { ProfileError } from './profile-messages';

/** What the deletion's two steps need of the world. */
export interface DeletionWorld {
  readonly throttle: (
    limits: readonly ThrottleLimit[],
    at: Instant,
  ) => Promise<ThrottleVerdict>;
  readonly load: (player: PlayerId) => Promise<Profile | undefined>;
  /** The deletion code, minted and mailed to the account's own address. */
  readonly sendCode: (
    email: EmailAddress,
    at: Instant,
  ) => Promise<'sent' | 'failed'>;
  /** The shared code check, purpose `account_deletion`. */
  readonly checkCode: (input: {
    readonly email: EmailAddress;
    readonly code: string;
    readonly now: Instant;
  }) => Promise<CodeCheck>;
  /** deleteAccount with `by: 'self'`: decided again under its own locks. */
  readonly deleteAccount: (
    player: PlayerId,
    at: Instant,
  ) => Promise<Result<AccountDeleted, AccountDeleteRefusal>>;
  /** After the commit: the cached boards go (pointsChanged), then this browser's session ends. */
  readonly afterDeletion: () => Promise<void>;
  /** Operational counts only, never who. */
  readonly logDeleted: (handedOver: number) => void;
}

/** A refusal shown in the danger zone (Laravel's `userDeletion` bag). */
const dangerRefused = (code: ProfileError): ProfileAnswer =>
  profileSaid({
    kind: 'profile-refused',
    bag: 'userDeletion',
    errors: { code },
  });

/**
 * UserProfileController::requestDeletionCode (3 per 10 minutes per account,
 * 10 per IP, route middleware: a refusal is Laravel's 429): a code for
 * purpose `account_deletion` mailed to the account's own address, read off
 * the session and never the request. A send that failed is said in the
 * danger zone.
 */
export async function requestDeletionCode(
  { player, ip, at }: ProfileRequest,
  world: DeletionWorld,
): Promise<ProfileAnswer> {
  const verdict = await world.throttle(
    deletionCodeRequestLimits(player.player, ip),
    at,
  );
  if (!verdict.allowed) return { kind: 'throttled', minutes: verdict.minutes };
  const profile = await world.load(player.player);
  if (profile === undefined) return { kind: 'redirect', to: '/', flash: null };
  const sent = await world.sendCode(profile.email, at);
  return sent === 'failed'
    ? dangerRefused('send-failed')
    : profileSaid({ kind: 'deletion-code-sent' });
}

/**
 * UserProfileController::destroy (5 per 10 minutes per account, 15 per IP,
 * a refusal is the 429): an empty code, or one the shared check refuses, is
 * `invalid` in the danger zone; then the account is deleted by itself
 * (R-25) - the last superadmin refused (R-131), the code spent either way -
 * nothing recalculated (R-99), the cached boards dropped, this browser
 * signed out, and home with no message and no audit row (R-130). The code is
 * read from the body only, trimmed, and checked against the address the
 * account holds now.
 */
export async function deleteOwnAccount(
  { player, form, ip, at }: ProfileRequest,
  world: DeletionWorld,
): Promise<ProfileAnswer> {
  const verdict = await world.throttle(
    deletionVerifyLimits(player.player, ip),
    at,
  );
  if (!verdict.allowed) return { kind: 'throttled', minutes: verdict.minutes };
  const code = formText(form, 'code');
  if (code === '') return dangerRefused('invalid');
  const profile = await world.load(player.player);
  if (profile === undefined) return { kind: 'redirect', to: '/', flash: null };
  const checked = await world.checkCode({
    email: profile.email,
    code,
    now: at,
  });
  if (checked === 'refused') return dangerRefused('invalid');
  const deleted = await world.deleteAccount(player.player, at);
  if (!deleted.ok) {
    if (deleted.refusal === 'last-superadmin') {
      return dangerRefused('last-superadmin');
    }
    // Gone since the check: nothing is left to delete, the session still ends.
    if (deleted.refusal !== 'no-such-account') {
      throw new Error(
        `deleteOwnAccount: ${deleted.refusal} for a self-deletion`,
      );
    }
  } else {
    world.logDeleted(deleted.value.handedOver.length);
  }
  await world.afterDeletion();
  return { kind: 'redirect', to: '/', flash: null };
}
