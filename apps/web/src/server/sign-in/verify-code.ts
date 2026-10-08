import { findAccountByEmail, recordLogin, type Db } from '@sportbet/db';
import {
  codeVerifyLimits,
  type Instant,
  type PlayerId,
} from '@sportbet/domain';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import type { SignInState } from '../../components/shell/sign-in-state';
import { env } from '../../env';
import { checkCode } from '../code-check';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { formText } from '../request/form-input';
import { startSession } from '../session/session';
import { clearPending, readPending, type PendingSignIn } from './pending';
import { readReturn } from './return-path';
import { refused, SIGN_IN_TEXT } from './texts';
import { throttle } from './throttle';
import { beforeTheLoginCode } from './verify-steps';

/**
 * EmailCodeLoginController::verify, for the address the pending cookie
 * holds: always one full hash comparison - against a dummy of the same
 * cost when no live code exists (#36 item 2) - then the atomic claim, then
 * the account, matched exactly (#41); one answer for every failure. On
 * success: a new session (there is none to fixate: the guest had none), its
 * cookie, the step forgotten, an email_code record (AuditLoginTest), and
 * back to the guarded page the guest came from, if /login kept one
 * (sportbet's `redirect()->intended`, checked again by guardedReturnPath),
 * else on to the player's home.
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
  const code = formText(form, 'code');
  const ready = beforeTheLoginCode({ verdict, code, pending });
  if (!ready.ok) return ready.state;
  const account = await claimedAccount(db, ready.pending, code, at);
  if (account === undefined) return refused('code', SIGN_IN_TEXT.wrongCode);
  return signIn({ db, jar, at }, account.player);
}

/** The code's atomic claim, then the account it signs in to, matched exactly (#41); none for any failure. */
async function claimedAccount(
  db: Db,
  pending: PendingSignIn,
  code: string,
  at: Instant,
): Promise<{ readonly player: PlayerId } | undefined> {
  const checked = await checkCode(db, {
    email: pending.email,
    purpose: 'login',
    code,
    now: at,
  });
  return checked === 'claimed'
    ? findAccountByEmail(db, pending.email)
    : undefined;
}

/** Signed in: a new session, an email_code record, the step forgotten, back to the guarded page kept or home. */
async function signIn(
  {
    db,
    jar,
    at,
  }: {
    readonly db: Db;
    readonly jar: Awaited<ReturnType<typeof cookies>>;
    readonly at: Instant;
  },
  player: PlayerId,
): Promise<never> {
  // Read before the session starts, which forgets it.
  const back = readReturn(jar);
  await startSession(db, jar, player, at);
  await recordLogin(db, { player, method: 'email_code', at });
  clearPending(jar);
  redirect(back ?? PLAYER_HOME);
}
