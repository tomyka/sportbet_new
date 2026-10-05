import { findAccountByEmail } from '@sportbet/db';
import { codeRequestLimits, emailAddress } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import type { SignInState } from '../../components/shell/sign-in-state';
import { env } from '../../env';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.js).
import { getDb } from '../../server/db';
import { formText } from '../request/form-input';
import { clearCookie, OPEN_SIGN_IN_COOKIE } from '../cookies';
import { readPending, writePending } from './pending';
import { pruneLater } from './prune';
import { sendCode } from './send-code';
import { refused, SIGN_IN_TEXT, throttledText } from './texts';
import { throttle } from './throttle';

/**
 * EmailCodeLoginController::request: throttled first, then the address
 * checked. The answer - the code step, its cookie, its timing - is the
 * same whether or not the address has an account (#36): the code is
 * minted, stored and mailed after the response, and only for an account.
 * A request for the address the step already showed is a resend
 * (issue 114).
 */
export async function requestCode(
  form: FormData,
  ip: string,
): Promise<SignInState> {
  const db = getDb();
  const at = now();
  const typed = formText(form, 'email');
  const verdict = await throttle(db, codeRequestLimits(typed, ip), at);
  if (!verdict.allowed) return refused('email', throttledText(verdict.minutes));
  if (typed === '') return refused('email', SIGN_IN_TEXT.emailRequired);
  const email = emailAddress(typed);
  if (!email.ok) return refused('email', SIGN_IN_TEXT.emailInvalid);
  const jar = await cookies();
  const secret = env().AUTH_SECRET;
  const previous = readPending(jar, secret, at);
  const account = await findAccountByEmail(db, email.value);
  if (account !== undefined) {
    const address = account.email;
    after(() => sendCode(address, at, 'login'));
  }
  pruneLater(db, at);
  writePending(jar, { email: email.value, sentAt: at }, secret);
  clearCookie(jar, OPEN_SIGN_IN_COOKIE);
  return { kind: 'sent', resent: previous?.email === email.value };
}
