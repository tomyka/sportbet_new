import {
  cancelEmailChange,
  confirmEmailChange,
  isEmailRegistered,
  isUsernameHeld,
  loadProfile,
  requestEmailChange,
  setReceiveReminders,
  updateProfileNames,
} from '@sportbet/db/account';
import { deleteAccount } from '@sportbet/db';
import { cookies } from 'next/headers';
import { env } from '../../env';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import {
  checkEmailedCode,
  sendEmailedCode,
  verifyEmailedCode,
} from '../emailed-code';
import { errorKind } from '../error-kind';
import { logInfo } from '../log';
import { createMailer } from '../mail/create-mailer';
import { emailChangedNoticeMail } from '../mail/email-changed-notice-mail';
import { MailDeliveryError } from '../mail/mail';
import { pointsChanged } from '../points-changed';
import { endSession, sessionTokenHash } from '../session/session';
import { throttle } from '../sign-in/throttle';
import type { ProfilePorts } from './profile-ports';

/** What a failed notice is, for the log: the mail service's status, or the error's kind - never an address. */
const kindOf = (error: unknown): string =>
  error instanceof MailDeliveryError ? error.message : errorKind(error);

/** The profile's real world: the database, the mailer, the session cookie and the boards' cache. */
export function profilePorts(): ProfilePorts {
  const db = getDb();
  return {
    throttle: (limits, at) => throttle(db, limits, at),
    load: (player) => loadProfile(db, player),

    usernameHeld: (username, except) => isUsernameHeld(db, username, except),
    emailHeld: (address, except) => isEmailRegistered(db, address, except),
    saveNames: ({ player, username, name, surname }) =>
      updateProfileNames(db, { player, username, name, surname }),
    requestChange: async (player, address, at) => {
      const sent = await sendEmailedCode({
        email: address,
        now: at,
        purpose: 'email_change',
      });
      // Parked only once the mail is away: a pending change always has a
      // code somebody could have received.
      if (sent === 'sent') await requestEmailChange(db, { player, address });
      return sent;
    },
    cancelPending: (player) => cancelEmailChange(db, player),

    checkChangeCode: ({ email, code, now }) =>
      checkEmailedCode(db, { email, purpose: 'email_change', code, now }),
    confirmChange: async (player, pending) =>
      confirmEmailChange(db, {
        player,
        pending,
        keepSession: sessionTokenHash(await cookies()),
      }),
    sendNotice: async (old, now) => {
      try {
        await createMailer(env()).send(emailChangedNoticeMail(old, now));
      } catch (error) {
        console.error(
          `profile: the address-change notice could not be sent (${kindOf(error)})`,
        );
      }
    },

    sendDeletionCode: (email, at) =>
      sendEmailedCode({ email, now: at, purpose: 'account_deletion' }),
    verifyDeletionCode: ({ email, code, now }) =>
      verifyEmailedCode(db, { email, purpose: 'account_deletion', code, now }),
    deleteAccount: (target, now, code) =>
      deleteAccount(db, { target, by: 'self', now, code }),
    afterDeletion: async () => {
      pointsChanged();
      const jar = await cookies();
      await endSession(db, jar, jar);
    },
    logDeleted: (handedOver) => {
      logInfo('account-deleted', { handedOver });
    },

    setReminders: (player, on) => setReceiveReminders(db, { player, on }),
  };
}
