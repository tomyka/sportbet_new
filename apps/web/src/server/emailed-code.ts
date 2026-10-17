import {
  claimLoginCode,
  findLiveLoginCode,
  issueLoginCode,
} from '@sportbet/db/account';
import type { Executor } from '@sportbet/db/connection';
import type { EmailAddress, Instant, LoginCodePurpose } from '@sportbet/domain';
import { env } from '../env';
// Not './db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../server/db';
import { errorKind } from './error-kind';
import { createMailer } from './mail/create-mailer';
import { deletionCodeMail } from './mail/deletion-code-mail';
import { emailChangeCodeMail } from './mail/email-change-code-mail';
import { loginCodeMail } from './mail/login-code-mail';
import { MailDeliveryError, type OutgoingMail } from './mail/mail';
import { registrationCodeMail } from './mail/registration-code-mail';
import {
  DUMMY_CODE_HASH,
  generateLoginCode,
  hashLoginCode,
  loginCodeMatches,
} from './sign-in/code-hash';

/**
 * The emailed one-time code, in one place: minted and mailed (the dialog's
 * two purposes, the admin's confirmation, the profile's address change and
 * deletion) and checked. A purpose never reaches a caller as a mail to pick:
 * each has its own mail here, except an admin's, which names the action and
 * is handed in.
 */

type MailOf = (to: EmailAddress, code: string) => OutgoingMail;

/** Each purpose's own mail (sportbet's LoginCodeMail, RegistrationCodeMail, AccountDeletionCodeMail, EmailChangeCodeMail). */
const OWN_MAIL: Readonly<Partial<Record<LoginCodePurpose, MailOf>>> = {
  login: loginCodeMail,
  registration: registrationCodeMail,
  account_deletion: deletionCodeMail,
  email_change: emailChangeCodeMail,
};

/** What a failure is, for the log: the mail service's status (its message names no address), or errorKind. */
const kindOf = (error: unknown) =>
  error instanceof MailDeliveryError ? error.message : errorKind(error);

/** An emailed code to mint: for whom, what for, when, and what it is bound to. */
export interface CodeToSend {
  readonly email: EmailAddress;
  readonly now: Instant;
  readonly purpose: LoginCodePurpose;
  /** What the code is bound to, hashed with it: only a check with the same binding redeems it. */
  readonly binding?: string;
  /** The mail, for a purpose whose mail is not its own (the admin's names the action). */
  readonly mail?: MailOf;
}

/**
 * Mints a code for the address and purpose, stores its hash (voiding the
 * live one of that purpose) and mails it, answering whether the mailer took
 * it: `failed` for a send that threw or that the staging allow-list
 * refused. The mailer is asked first whether it would deliver at all
 * (sportbet's mailerWouldLeakCodes runs before issue), so a refusal leaves
 * the code the person already holds alive. A failure is logged by its kind
 * only - never the address, never the code (#36 item 3).
 */
export async function sendEmailedCode(
  input: CodeToSend,
): Promise<'sent' | 'failed'> {
  const { email, now, purpose, binding } = input;
  const mail = input.mail ?? OWN_MAIL[purpose];
  if (mail === undefined) {
    throw new Error(`sendEmailedCode: no mail for a ${purpose} code`);
  }
  try {
    const mailer = createMailer(env());
    if (!mailer.mayDeliver(email)) return 'failed';
    const code = generateLoginCode();
    await issueLoginCode(getDb(), {
      email,
      purpose,
      codeHash: await hashLoginCode(code, binding),
      now,
    });
    const outcome = await mailer.send(mail(email, code));
    return outcome === 'sent' ? 'sent' : 'failed';
  } catch (error) {
    console.error(
      `sign-in: a ${purpose} code could not be sent (${kindOf(error)})`,
    );
    return 'failed';
  }
}

/** What an emailed code typed for an address and purpose came to. */
export type CodeCheck = 'claimed' | 'refused';

export interface CodeTyped {
  readonly email: EmailAddress;
  readonly purpose: LoginCodePurpose;
  readonly code: string;
  readonly now: Instant;
  /** What the code was bound to when it was minted, if anything. */
  readonly binding?: string;
}

/**
 * The live code of the address and purpose if the typed one is it, not yet
 * claimed (#43: a code of another purpose never counts): always one full
 * hash comparison - against a dummy of the same cost when none is live
 * (#36 item 2). A code minted with a binding matches only that binding.
 */
export async function verifyEmailedCode(
  db: Executor,
  { email, purpose, code, now, binding }: CodeTyped,
): Promise<number | null> {
  const live = await findLiveLoginCode(db, email, purpose, now);
  const matches = await loginCodeMatches(
    code,
    live?.codeHash ?? DUMMY_CODE_HASH,
    binding,
  );
  return live !== undefined && matches ? live.id : null;
}

/**
 * The one emailed-code check, sign-in's (EmailCodeLoginController::verify),
 * registration's (RegisteredUserController::confirm), an admin's
 * confirmation's and the profile's address change: `verifyEmailedCode`, then
 * the atomic claim, so a code is used at most once. A mismatch claims
 * nothing. Every failure is the one answer, `refused`.
 */
export async function checkEmailedCode(
  db: Executor,
  typed: CodeTyped,
): Promise<CodeCheck> {
  const id = await verifyEmailedCode(db, typed);
  return id !== null && (await claimLoginCode(db, id, typed.now))
    ? 'claimed'
    : 'refused';
}
