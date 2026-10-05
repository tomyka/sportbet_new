import { issueLoginCode } from '@sportbet/db';
import type { EmailAddress, Instant, LoginCodePurpose } from '@sportbet/domain';
import { env } from '../../env';
// Not '../db': lint reads that as packages/db (eslint.config.js).
import { getDb } from '../../server/db';
import { errorKind } from '../error-kind';
import { createMailer } from '../mail/create-mailer';
import { loginCodeMail } from '../mail/login-code-mail';
import { MailDeliveryError, type OutgoingMail } from '../mail/mail';
import { registrationCodeMail } from '../mail/registration-code-mail';
import { generateLoginCode, hashLoginCode } from './code-hash';

/** The purposes a visitor asks a code for in the dialog. */
type DialogCodePurpose = Extract<LoginCodePurpose, 'login' | 'registration'>;

/** Each purpose's own mail (sportbet's LoginCodeMail and RegistrationCodeMail). */
const MAIL_FOR: Readonly<
  Record<DialogCodePurpose, (to: EmailAddress, code: string) => OutgoingMail>
> = { login: loginCodeMail, registration: registrationCodeMail };

/** What a failure is, for the log: the mail service's status (its message names no address), or errorKind. */
const kindOf = (error: unknown) =>
  error instanceof MailDeliveryError ? error.message : errorKind(error);

/**
 * Mints a code for the address and purpose, stores its hash (voiding the
 * live one of that purpose) and mails it. Run after the response, never
 * queued (sportbet's dispatch()->afterResponse(), #36 item 1). A failure
 * is logged by its kind only - never the address, never the code (#36
 * item 3) - and the visitor's answer, already sent, cannot change.
 */
export async function sendCode(
  email: EmailAddress,
  now: Instant,
  purpose: DialogCodePurpose,
): Promise<void> {
  try {
    const code = generateLoginCode();
    await issueLoginCode(getDb(), {
      email,
      purpose,
      codeHash: await hashLoginCode(code),
      now,
    });
    await createMailer(env()).send(MAIL_FOR[purpose](email, code));
  } catch (error) {
    console.error(
      `sign-in: a ${purpose} code could not be sent (${kindOf(error)})`,
    );
  }
}
