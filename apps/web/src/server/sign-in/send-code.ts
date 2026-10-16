import { issueLoginCode } from '@sportbet/db';
import type { EmailAddress, Instant, LoginCodePurpose } from '@sportbet/domain';
import { env } from '../../env';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
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
 * live one of that purpose) and mails it as `mail` builds it, answering
 * whether the mailer took it: `failed` for a send that threw or that the
 * staging allow-list refused. A failure is logged by its kind only - never
 * the address, never the code (#36 item 3). The one place a code is minted
 * and mailed: the dialog's two purposes, the admin's confirmation (R-26
 * amended) and the profile's two (R-24, R-25) all come through it.
 */
export async function mintAndSendCode(
  input: CodeToSend,
  mail: (to: EmailAddress, code: string) => OutgoingMail,
): Promise<'sent' | 'failed'> {
  const { email, now, purpose, binding } = input;
  try {
    const code = generateLoginCode();
    await issueLoginCode(getDb(), {
      email,
      purpose,
      codeHash: await hashLoginCode(code, binding),
      now,
    });
    const outcome = await createMailer(env()).send(mail(email, code));
    return outcome === 'sent' ? 'sent' : 'failed';
  } catch (error) {
    console.error(
      `sign-in: a ${purpose} code could not be sent (${kindOf(error)})`,
    );
    return 'failed';
  }
}

interface CodeToSend {
  readonly email: EmailAddress;
  readonly now: Instant;
  readonly purpose: LoginCodePurpose;
  /** What the code is bound to, hashed with it: only checkCode with the same binding redeems it. */
  readonly binding?: string;
}

/**
 * Run after the response, never queued (sportbet's
 * dispatch()->afterResponse(), #36 item 1): the visitor's answer, already
 * sent, cannot change, so mintAndSendCode's outcome is dropped.
 */
export async function sendMailedCode(
  input: CodeToSend,
  mail: (to: EmailAddress, code: string) => OutgoingMail,
): Promise<void> {
  await mintAndSendCode(input, mail);
}

/** The dialog's code for the address and purpose, mailed as that purpose's own mail. */
export function sendCode(
  email: EmailAddress,
  now: Instant,
  purpose: DialogCodePurpose,
): Promise<void> {
  return sendMailedCode({ email, now, purpose }, MAIL_FOR[purpose]);
}
