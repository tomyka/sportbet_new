import type { Profile } from '@sportbet/db';
import {
  AddressState,
  emailChangeRequestLimits,
  profileFormEntry,
  withHeld,
  type EmailAddress,
  type HeldFields,
  type PlayerId,
  type ProfileFormCheck,
  type ProfileProblems,
} from '@sportbet/domain';
import { formText } from '../request/form-input';
import {
  profileSaid,
  type ProfileAnswer,
  type ProfileRequest,
} from './profile-action';
import {
  ACCOUNT_FIELDS,
  cutToBytes,
  type AccountError,
} from './profile-messages';
import type { ProfilePorts } from './profile-ports';

/** What the form's use case needs of the world: reads, writes, the throttle and the mailed code. */
export type UpdateProfileWorld = Pick<
  ProfilePorts,
  | 'load'
  | 'usernameHeld'
  | 'emailHeld'
  | 'saveNames'
  | 'cancelPending'
  | 'throttle'
  | 'requestChange'
>;

type FieldErrors = Partial<
  Record<(typeof ACCOUNT_FIELDS)[number], AccountError>
>;

/** The form refused: back to the profile with each field's reason and what was typed (Laravel's errors and old input), cut to what a cookie holds. */
function refused(
  form: FormData,
  errors: FieldErrors,
  minutes?: number,
): ProfileAnswer {
  return profileSaid({
    kind: 'account-refused',
    errors,
    values: {
      username: cutToBytes(formText(form, 'username')),
      name: cutToBytes(formText(form, 'name')),
      surname: cutToBytes(formText(form, 'surname')),
      email: cutToBytes(formText(form, 'email')),
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
 * Which of the username and the address another account holds: asked only of
 * a field that passed its format and differs from the account's own.
 */
async function heldFields(
  checked: ProfileFormCheck,
  profile: Profile,
  player: PlayerId,
  world: UpdateProfileWorld,
): Promise<HeldFields> {
  const { username, email } = checked;
  return {
    username:
      username !== null &&
      username !== profile.username &&
      (await world.usernameHeld(username, player)),
    email:
      email !== null &&
      email !== profile.email &&
      (await world.emailHeld(email, player)),
  };
}

/**
 * UserProfileController::updateUserProfile: every field checked in one pass
 * as Laravel reports every field - the format (profileFormEntry) and, for a
 * username or an address that passed its format and differs from the
 * account's own, whether another account holds it (`withHeld`: a field's
 * format refusal first). Asking is no mail and no write and is not throttled:
 * sportbet's `unique` rule runs on every post with no limit on this route,
 * so parity keeps it so. A refusal writes nothing. Then the names take
 * effect at once (updateProfileNames, which asks the username again under
 * the registration lock when it changed). The address is a credential and
 * does not: unchanged it drops any pending change ("Profilis atnaujintas."),
 * changed it asks for a code mailed to the new address (askForChange).
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
  const profile = await world.load(player.player);
  if (profile === undefined) return { kind: 'redirect', to: '/', flash: null };
  const problems = withHeld(
    checked.problems,
    await heldFields(checked, profile, player.player, world),
  );
  const entry = checked.entry;
  if (entry === null || Object.keys(problems).length > 0) {
    return refused(form, problemsAsErrors(problems));
  }
  const intent = AddressState.of(profile.email, profile.pendingEmail).intent(
    entry.email,
  );
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
