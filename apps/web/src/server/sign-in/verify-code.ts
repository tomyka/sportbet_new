import { findAccountByEmail, recordLogin } from '@sportbet/db';
import { codeVerifyLimits } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import type { SignInState } from '../../components/shell/sign-in-state';
import { env } from '../../env';
import { checkCode } from '../code-check';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.js).
import { getDb } from '../../server/db';
import { formText } from '../request/form-input';
import { startSession } from '../session/session';
import { clearPending, readPending } from './pending';
import { refused, SIGN_IN_TEXT, throttledText } from './texts';
import { throttle } from './throttle';

/**
 * EmailCodeLoginController::verify, for the address the pending cookie
 * holds: always one full hash comparison - against a dummy of the same
 * cost when no live code exists (#36 item 2) - then the atomic claim, then
 * the account, matched exactly (#41); one answer for every failure. On
 * success: a new session (there is none to fixate: the guest had none), its
 * cookie, the step forgotten, an email_code record (AuditLoginTest), and
 * on to the player's home: no 4b page is guarded, so there is no intended
 * page to return to (review W5).
 */
export async function verifyCode(
  form: FormData,
  ip: string,
): Promise<SignInState> {
  const db = getDb();
  const at = now();
  const jar = await cookies();
  const pending = readPending(jar, env().AUTH_SECRET, at);
  const verdict = await throttle(
    db,
    codeVerifyLimits(pending?.email ?? null, ip),
    at,
  );
  if (!verdict.allowed) return refused('code', throttledText(verdict.minutes));
  const code = formText(form, 'code');
  if (code === '') return refused('code', SIGN_IN_TEXT.codeRequired);
  if (pending === null) return refused('code', SIGN_IN_TEXT.noPendingEmail);
  const checked = await checkCode(db, {
    email: pending.email,
    purpose: 'login',
    code,
    now: at,
  });
  const account =
    checked === 'claimed'
      ? await findAccountByEmail(db, pending.email)
      : undefined;
  if (account === undefined) return refused('code', SIGN_IN_TEXT.wrongCode);
  await startSession(db, jar, account.player, at);
  await recordLogin(db, { player: account.player, method: 'email_code', at });
  clearPending(jar);
  redirect(PLAYER_HOME);
}
