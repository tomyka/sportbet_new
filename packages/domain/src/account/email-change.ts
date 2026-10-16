import { ok, refuse, type Result } from '../shared/result';
import type { EmailAddress } from './email';

/** What a profile edit's address means (ProfileController: unchanged, a dropped change, or a request). */
export type EmailChangeIntent =
  'unchanged' | 'cancel-pending' | { readonly change: EmailAddress };

/**
 * Why an address change is not confirmed, the one vocabulary of the db and
 * the page: `none` nothing waits for this code, `invalid` the code is wrong,
 * expired or of another purpose, `taken` another account holds the address.
 */
export type EmailChangeRefusal = 'none' | 'invalid' | 'taken';

/** What a confirmed change came to: the address the account left, and the one it holds now. */
export interface AddressMoved {
  readonly old: EmailAddress;
  readonly now: EmailAddress;
}

/**
 * An account's address and the change that may wait for a code (sportbet
 * #289): the live address, which signs in and is told of changes, and the
 * pending one, which only becomes the live one when its owner returns the
 * code mailed to it. It decides what a posted address asks and whether a
 * confirmation moves the account; the database writes what it decides under
 * the player row's lock.
 */
export class AddressState {
  readonly current: EmailAddress;
  readonly pending: EmailAddress | null;

  private constructor(current: EmailAddress, pending: EmailAddress | null) {
    this.current = current;
    this.pending = pending;
  }

  static of(current: EmailAddress, pending: EmailAddress | null): AddressState {
    return new AddressState(current, pending);
  }

  /**
   * What the posted address asks (UserProfileController::updateUserProfile):
   * equal to the current address it asks for no change - and drops a pending
   * one, the person having just said the current one is what they want;
   * anything else asks for a change, also an address equal to the pending
   * one (a re-request mails a fresh code, as sportbet). All normalized.
   */
  intent(requested: EmailAddress): EmailChangeIntent {
    if (requested === this.current) {
      return this.pending === null ? 'unchanged' : 'cancel-pending';
    }
    return { change: requested };
  }

  /**
   * ProfileService::confirmEmailChange's decision, after the code for
   * `confirming` was claimed: `none` unless the account still waits for
   * exactly that address (a change cancelled or re-requested meanwhile),
   * `taken` when another account holds it (the code stays spent, as
   * sportbet), else the move.
   */
  confirm(
    confirming: EmailAddress,
    heldByAnother: boolean,
  ): Result<AddressMoved, Exclude<EmailChangeRefusal, 'invalid'>> {
    if (this.pending !== confirming) return refuse('none');
    if (heldByAnother) return refuse('taken');
    return ok({ old: this.current, now: confirming });
  }
}
