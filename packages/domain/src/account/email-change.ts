import type { EmailAddress } from './email';

/** What a profile edit's address means (ProfileController: unchanged, a dropped change, or a request). */
export type EmailChangeIntent =
  'unchanged' | 'cancel-pending' | { readonly change: EmailAddress };

/** Why an address change is not confirmed. */
export type EmailChangeRefusal = 'none' | 'invalid' | 'taken';

/**
 * What the posted address asks (UserProfileController::updateUserProfile):
 * equal to the current address it asks for no change - and drops a pending
 * one, the person having just said the current one is what they want;
 * anything else asks for a change, also an address equal to the pending one
 * (a re-request mails a fresh code, as sportbet). All three normalized.
 */
export function emailChangeIntent(
  current: EmailAddress,
  pending: EmailAddress | null,
  requested: EmailAddress,
): EmailChangeIntent {
  if (requested === current) {
    return pending === null ? 'unchanged' : 'cancel-pending';
  }
  return { change: requested };
}
