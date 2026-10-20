import type { AccountDeleteRefusal } from '@sportbet/db';
import {
  deletionCodeRequestLimits,
  deletionVerifyLimits,
} from '@sportbet/domain';
import { formText } from '../request/form-input';
import {
  profileSaid,
  type ProfileAnswer,
  type ProfileRequest,
} from './profile-action';
import type { CodeError } from './profile-messages';
import type { ProfilePorts } from './profile-ports';

/** What the deletion's two steps need of the world. */
export type DeletionWorld = Pick<
  ProfilePorts,
  | 'throttle'
  | 'load'
  | 'sendDeletionCode'
  | 'verifyDeletionCode'
  | 'deleteAccount'
  | 'afterDeletion'
  | 'logDeleted'
>;

/** A refusal shown in the danger zone (Laravel's `userDeletion` bag). */
/** An account already gone moved nothing (deleteAccount's BoardEffect says so for a deletion). */
const NOTHING_MOVED = { boardChanged: false };

const dangerRefused = (error: CodeError): ProfileAnswer =>
  profileSaid({ kind: 'code-refused', bag: 'userDeletion', error });

/** The danger zone's answer to a refused self-deletion, or null for an account already gone; any other refusal is impossible for one. */
function refusalAnswer(refusal: AccountDeleteRefusal): ProfileAnswer | null {
  if (refusal === 'last-superadmin') return dangerRefused('last-superadmin');
  if (refusal === 'code-spent') return dangerRefused('invalid');
  if (refusal === 'no-such-account') return null;
  throw new Error(`deleteOwnAccount: ${refusal} for a self-deletion`);
}

/**
 * UserProfileController::requestDeletionCode (3 per 10 minutes per account,
 * 10 per IP, route middleware: a refusal is Laravel's 429): a code for
 * purpose `account_deletion` mailed to the account's own address, read off
 * the session and never the request. A send that failed - or that the
 * mailer would not make, which leaves the code already held alive - is said
 * in the danger zone.
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
  const sent = await world.sendDeletionCode(profile.email, at);
  return sent === 'failed'
    ? dangerRefused('send-failed')
    : profileSaid({ kind: 'deletion-code-sent' });
}

/**
 * UserProfileController::destroy (5 per 10 minutes per account, 15 per IP,
 * a refusal is the 429): an empty code, or one the shared check refuses, is
 * `invalid` in the danger zone; then the account is deleted by itself
 * (R-25), the code claimed inside the deletion's own transaction, so it is
 * spent exactly when the account goes (sportbet spends it whether or not
 * the deletion follows; here a refusal writes nothing, the code included, so
 * the last superadmin (R-131) can appoint another and use the same code
 * within its minutes). A code claimed or expired between the check and the
 * deletion is `invalid` too. Nothing is recalculated (R-99), the cached
 * boards are dropped, this browser signed out, and home with no message and
 * no audit row (R-130). The code is read from the body only, trimmed, and
 * checked against the address the account holds now. A deletion that waits
 * past its lock timeout or loses every race for its locks is the route's
 * 503 (answerProfilePost), with nothing written and the code still live.
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
  const codeId = await world.verifyDeletionCode({
    email: profile.email,
    code,
    now: at,
  });
  if (codeId === null) return dangerRefused('invalid');
  const deleted = await world.deleteAccount(player.player, at, codeId);
  if (!deleted.ok) {
    const refused = refusalAnswer(deleted.refusal);
    if (refused !== null) return refused;
    // Gone since the check: nothing is left to delete, the session still ends.
  } else {
    world.logDeleted(deleted.value.handedOver.length);
  }
  await world.afterDeletion(deleted.ok ? deleted.value : NOTHING_MOVED);
  return { kind: 'redirect', to: '/', flash: null };
}
