import {
  cancelEmailChange,
  confirmEmailChange,
  deleteAccount,
  isEmailRegistered,
  loadProfile,
  requestEmailChange,
  setReceiveReminders,
  updateProfileNames,
} from '@sportbet/db';
import { cookies } from 'next/headers';
import { env } from '../../env';
import { checkCode } from '../code-check';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { errorKind } from '../error-kind';
import { logInfo } from '../log';
import { createMailer } from '../mail/create-mailer';
import { deletionCodeMail } from '../mail/deletion-code-mail';
import { emailChangeCodeMail } from '../mail/email-change-code-mail';
import { emailChangedNoticeMail } from '../mail/email-changed-notice-mail';
import { MailDeliveryError } from '../mail/mail';
import { pointsChanged } from '../points-changed';
import { endSession } from '../session/session';
import { mintAndSendCode } from '../sign-in/send-code';
import { throttle } from '../sign-in/throttle';
import type { DeletionWorld } from './delete-account';
import type { EmailChangeWorld } from './email-change';
import type { NotificationsWorld } from './notifications';
import type { UpdateProfileWorld } from './update-profile';

/** The form's real world: the profile reads, the names' writer, the address change's request and the throttle. */
export function updateProfileWorld(): UpdateProfileWorld {
  const db = getDb();
  return {
    load: (player) => loadProfile(db, player),
    emailTaken: (address, except) => isEmailRegistered(db, address, except),
    saveNames: ({ player, username, name, surname }) =>
      updateProfileNames(db, { player, username, name, surname }),
    cancelPending: (player) => cancelEmailChange(db, player),
    throttle: (limits, at) => throttle(db, limits, at),
    requestChange: async (player, address, at) => {
      const sent = await mintAndSendCode(
        { email: address, now: at, purpose: 'email_change' },
        emailChangeCodeMail,
      );
      // Parked only once the mail is away: a pending change always has a
      // code somebody could have received.
      if (sent === 'sent') await requestEmailChange(db, { player, address });
      return sent;
    },
  };
}

/** What a failed notice is, for the log: the mail service's status, or the error's kind - never an address. */
const kindOf = (error: unknown): string =>
  error instanceof MailDeliveryError ? error.message : errorKind(error);

/** Confirming an address change in the real world. */
export function emailChangeWorld(): EmailChangeWorld {
  const db = getDb();
  return {
    throttle: (limits, at) => throttle(db, limits, at),
    load: (player) => loadProfile(db, player),
    checkCode: ({ email, code, now }) =>
      checkCode(db, { email, purpose: 'email_change', code, now }),
    confirm: (player, pending) => confirmEmailChange(db, { player, pending }),
    sendNotice: async (old, now) => {
      try {
        await createMailer(env()).send(emailChangedNoticeMail(old, now));
      } catch (error) {
        console.error(
          `profile: the address-change notice could not be sent (${kindOf(error)})`,
        );
      }
    },
    cancel: (player) => cancelEmailChange(db, player),
  };
}

/** The deletion's real world: the shared code check, `deleteAccount` by itself, and after it the boards and the session. */
export function deletionWorld(): DeletionWorld {
  const db = getDb();
  return {
    throttle: (limits, at) => throttle(db, limits, at),
    load: (player) => loadProfile(db, player),
    sendCode: (email, at) =>
      mintAndSendCode(
        { email, now: at, purpose: 'account_deletion' },
        deletionCodeMail,
      ),
    checkCode: ({ email, code, now }) =>
      checkCode(db, { email, purpose: 'account_deletion', code, now }),
    deleteAccount: (target, now) =>
      deleteAccount(db, { target, by: 'self', now }),
    afterDeletion: async () => {
      pointsChanged();
      const jar = await cookies();
      await endSession(db, jar, jar);
    },
    logDeleted: (handedOver) => {
      logInfo('account-deleted', { handedOver });
    },
  };
}

/** The reminder switch's real world: slice 16's one writer of the setting. */
export function notificationsWorld(): NotificationsWorld {
  const db = getDb();
  return {
    setReminders: (player, on) => setReceiveReminders(db, { player, on }),
  };
}
