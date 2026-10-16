import { emailChangeVerifyLimits } from '@sportbet/domain';
import { formText } from '../request/form-input';
import {
  profileSaid,
  type ProfileAnswer,
  type ProfileRequest,
} from './profile-action';
import type { CodeError } from './profile-messages';
import type { ProfilePorts } from './profile-ports';

/** What confirming an address change needs of the world. */
export type EmailChangeWorld = Pick<
  ProfilePorts,
  | 'throttle'
  | 'load'
  | 'checkChangeCode'
  | 'confirmChange'
  | 'sendNotice'
  | 'cancelPending'
>;

/** The confirmation's refusal, shown beside the code box (Laravel's `emailChange` bag). */
const codeRefused = (error: CodeError): ProfileAnswer =>
  profileSaid({ kind: 'code-refused', bag: 'emailChange', error });

/**
 * UserProfileController::confirmEmailChange (5 per 10 minutes per account,
 * 15 per IP, as route middleware: a refusal is Laravel's 429): an empty code
 * is wrong whatever is pending; nothing pending is `none`; a code that is
 * wrong, expired or of another purpose is `invalid` (the one answer of
 * checkEmailedCode, on the pending address); the address taken meanwhile is
 * `taken` (the code is spent, as sportbet); else the address moves, every
 * other session of the account ends (R-132) and the old address is told.
 * The code is read from the body only, trimmed.
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
  const checked = await world.checkChangeCode({
    email: pending,
    code,
    now: at,
  });
  if (checked === 'refused') return codeRefused('invalid');
  const moved = await world.confirmChange(player.player, pending);
  if (!moved.ok) return codeRefused(moved.refusal);
  await world.sendNotice(moved.value.old, moved.value.now);
  return profileSaid({ kind: 'email-changed' });
}

/** UserProfileController::cancelEmailChange: drops a pending change and keeps the current address. */
export async function cancelAddressChange(
  { player }: ProfileRequest,
  world: Pick<EmailChangeWorld, 'cancelPending'>,
): Promise<ProfileAnswer> {
  await world.cancelPending(player.player);
  return profileSaid({ kind: 'email-change-cancelled' });
}
