import type {
  AccountDeleted,
  AccountDeleteRefusal,
  Profile,
} from '@sportbet/db';
import type {
  AddressMoved,
  EmailAddress,
  EmailChangeRefusal,
  Instant,
  PlayerId,
  ProfileEntry,
  Result,
  ThrottleLimit,
} from '@sportbet/domain';
import type { CodeCheck, CodeTyped } from '../emailed-code';
import type { ThrottleVerdict } from '../sign-in/throttle';

/** The code a use case checks: for whom and which code, its purpose being the use case's own. */
type CodeAsked = Pick<CodeTyped, 'email' | 'code' | 'now'>;

/**
 * Everything the profile's use cases need of the world, in one interface
 * (reads, the throttle, the writers, the mailed codes). Each use case takes
 * the part it uses (`Pick<ProfilePorts, ...>`), the real adapter is
 * profile-worlds.ts's `profilePorts`, and a test hands in what its case needs.
 */
export interface ProfilePorts {
  readonly throttle: (
    limits: readonly ThrottleLimit[],
    at: Instant,
  ) => Promise<ThrottleVerdict>;
  readonly load: (player: PlayerId) => Promise<Profile | undefined>;

  /** Whether another account holds the username, as sportbet's collation compares it (isUsernameHeld). */
  readonly usernameHeld: (
    username: string,
    except: PlayerId,
  ) => Promise<boolean>;
  /** Whether another account holds the address, as the collation folds it (isEmailRegistered). */
  readonly emailHeld: (
    address: EmailAddress,
    except: PlayerId,
  ) => Promise<boolean>;
  readonly saveNames: (
    write: Pick<ProfileEntry, 'username' | 'name' | 'surname'> & {
      readonly player: PlayerId;
    },
  ) => Promise<Result<void, 'username-taken' | 'unknown-player'>>;
  /** Mails the code to the new address and, once it is sent, parks the address; `failed` leaves nothing pending. */
  readonly requestChange: (
    player: PlayerId,
    address: EmailAddress,
    at: Instant,
  ) => Promise<'sent' | 'failed'>;
  /** Drops a pending change, keeping the live address. */
  readonly cancelPending: (player: PlayerId) => Promise<void>;

  /** The shared code check, purpose `email_change`, for the pending address. */
  readonly checkChangeCode: (input: CodeAsked) => Promise<CodeCheck>;
  /** confirmEmailChange: the move under the player row's lock; every other session of the account ends (R-132), this browser's stays. */
  readonly confirmChange: (
    player: PlayerId,
    pending: EmailAddress,
  ) => Promise<Result<AddressMoved, Exclude<EmailChangeRefusal, 'invalid'>>>;
  /** The notice to the old address; a failure is logged by kind and never undoes the move. */
  readonly sendNotice: (old: EmailAddress, now: EmailAddress) => Promise<void>;

  /** The deletion code, minted and mailed to the account's own address. */
  readonly sendDeletionCode: (
    email: EmailAddress,
    at: Instant,
  ) => Promise<'sent' | 'failed'>;
  /** The id of the account's live deletion code if the typed one is it, not yet claimed. */
  readonly verifyDeletionCode: (input: CodeAsked) => Promise<number | null>;
  /** deleteAccount by itself, the code claimed in its transaction: decided again under its own locks. */
  readonly deleteAccount: (
    player: PlayerId,
    at: Instant,
    code: number,
  ) => Promise<Result<AccountDeleted, AccountDeleteRefusal>>;
  /** After the commit: the cached boards go (pointsChanged), then this browser's session ends. */
  readonly afterDeletion: () => Promise<void>;
  /** Operational counts only, never who. */
  readonly logDeleted: (handedOver: number) => void;

  readonly setReminders: (
    player: PlayerId,
    on: boolean,
  ) => Promise<Result<void, 'unknown-player'>>;
}
