import type { Profile } from '@sportbet/db';
import {
  emailChangeIntent,
  emailChangeRequestLimits,
  profileFormEntry,
  type EmailAddress,
  type Instant,
  type PlayerId,
  type ProfileEntry,
  type ProfileProblems,
  type Result,
  type ThrottleLimit,
} from '@sportbet/domain';
import { formText } from '../request/form-input';
import type { ThrottleVerdict } from '../sign-in/throttle';
import {
  profileSaid,
  type ProfileAnswer,
  type ProfileRequest,
} from './profile-action';
import {
  ACCOUNT_FIELDS,
  MAX_VALUE_LENGTH,
  type ProfileError,
} from './profile-messages';

/** What the form's use case needs of the world: reads, writes, the throttle and the mailed code. */
export interface UpdateProfileWorld {
  readonly load: (player: PlayerId) => Promise<Profile | undefined>;
  /** Whether another account holds the address, as the collation folds it (isEmailRegistered). */
  readonly emailTaken: (
    address: EmailAddress,
    except: PlayerId,
  ) => Promise<boolean>;
  readonly saveNames: (
    write: Pick<ProfileEntry, 'username' | 'name' | 'surname'> & {
      readonly player: PlayerId;
    },
  ) => Promise<Result<void, 'username-taken' | 'unknown-player'>>;
  readonly cancelPending: (player: PlayerId) => Promise<void>;
  readonly throttle: (
    limits: readonly ThrottleLimit[],
    at: Instant,
  ) => Promise<ThrottleVerdict>;
  /** Mails the code to the new address and, once it is sent, parks the address; `failed` leaves nothing pending. */
  readonly requestChange: (
    player: PlayerId,
    address: EmailAddress,
    at: Instant,
  ) => Promise<'sent' | 'failed'>;
}

type FieldErrors = Partial<
  Record<(typeof ACCOUNT_FIELDS)[number], ProfileError>
>;

const cut = (text: string): string =>
  Array.from(text).slice(0, MAX_VALUE_LENGTH).join('');

/** The form refused: back to the profile with each field's reason and what was typed (Laravel's errors and old input). */
function refused(
  form: FormData,
  errors: FieldErrors,
  minutes?: number,
): ProfileAnswer {
  return profileSaid({
    kind: 'profile-refused',
    bag: 'account',
    errors,
    values: {
      username: cut(formText(form, 'username')),
      name: cut(formText(form, 'name')),
      surname: cut(formText(form, 'surname')),
      email: cut(formText(form, 'email')),
    },
    ...(minutes === undefined ? {} : { minutes }),
  });
}

const problemsAsErrors = (problems: ProfileProblems): FieldErrors => ({
  ...problems,
});

/**
 * The address's own change, once the form passed and the names are saved:
 * three requests per ten minutes per account, counted only here (on the
 * path that sends) and answered in the form; a code mailed to the new
 * address, and only then is it parked.
 */
async function askForChange(
  { player, form, at }: ProfileRequest,
  address: EmailAddress,
  world: UpdateProfileWorld,
): Promise<ProfileAnswer> {
  const verdict = await world.throttle(
    emailChangeRequestLimits(player.player),
    at,
  );
  if (!verdict.allowed) {
    return refused(form, { email: 'throttled' }, verdict.minutes);
  }
  const sent = await world.requestChange(player.player, address, at);
  return sent === 'failed'
    ? refused(form, { email: 'send-failed' })
    : profileSaid({ kind: 'email-change-requested', email: address });
}

/**
 * UserProfileController::updateUserProfile: the form checked field by field
 * (profileFormEntry), the address not another account's, the username not
 * another's (updateProfileNames, under the registration lock); a refusal
 * writes nothing. Then the names take effect at once. The address is a
 * credential and does not: unchanged it drops any pending change
 * ("Profilis atnaujintas."), changed it asks for a code mailed to the new
 * address (askForChange).
 */
export async function updateProfile(
  request: ProfileRequest,
  world: UpdateProfileWorld,
): Promise<ProfileAnswer> {
  const { player, form } = request;
  const checked = profileFormEntry({
    username: formText(form, 'username'),
    name: formText(form, 'name'),
    surname: formText(form, 'surname'),
    email: formText(form, 'email'),
  });
  if (!checked.ok) return refused(form, problemsAsErrors(checked.problems));
  const profile = await world.load(player.player);
  if (profile === undefined) return { kind: 'redirect', to: '/', flash: null };
  const entry = checked.value;
  const intent = emailChangeIntent(
    profile.email,
    profile.pendingEmail,
    entry.email,
  );
  if (
    typeof intent === 'object' &&
    (await world.emailTaken(intent.change, player.player))
  ) {
    return refused(form, { email: 'taken' });
  }
  const saved = await world.saveNames({ player: player.player, ...entry });
  if (!saved.ok) {
    if (saved.refusal === 'username-taken') {
      return refused(form, { username: 'taken' });
    }
    return { kind: 'redirect', to: '/', flash: null };
  }
  if (typeof intent === 'object') {
    return askForChange(request, intent.change, world);
  }
  if (intent === 'cancel-pending') await world.cancelPending(player.player);
  return profileSaid({ kind: 'profile-updated' });
}
