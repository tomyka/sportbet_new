import { issueLoginCode } from '@sportbet/db';
import type { EmailAddress, Instant } from '@sportbet/domain';
import { env } from '../../env';
// Not '../db': lint reads that as packages/db (eslint.config.js).
import { getDb } from '../../server/db';
import { errorKind } from '../error-kind';
import { createMailer } from '../mail/create-mailer';
import { loginCodeMail } from '../mail/login-code-mail';
import { MailDeliveryError } from '../mail/mail';
import { generateLoginCode, hashLoginCode } from './code-hash';

/** What a failure is, for the log: the mail service's status (its message names no address), or errorKind. */
const kindOf = (error: unknown) =>
  error instanceof MailDeliveryError ? error.message : errorKind(error);

/**
 * Mints a sign-in code for an account's address, stores its hash (voiding
 * the live one) and mails it. Run after the response, never queued
 * (sportbet's dispatch()->afterResponse(), #36 item 1). A failure is
 * logged by its kind only - never the address, never the code (#36 item
 * 3) - and the visitor's answer, already sent, cannot change.
 */
export async function sendLoginCode(
  email: EmailAddress,
  now: Instant,
): Promise<void> {
  try {
    const code = generateLoginCode();
    await issueLoginCode(getDb(), {
      email,
      purpose: 'login',
      codeHash: await hashLoginCode(code),
      now,
    });
    await createMailer(env()).send(loginCodeMail(email, code));
  } catch (error) {
    console.error(`sign-in: a login code could not be sent (${kindOf(error)})`);
  }
}
