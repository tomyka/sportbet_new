import { createAccount, recordLogin } from '@sportbet/db';
import { registerConfirmLimits, ruledRules } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  EMPTY_REGISTER_VALUES,
  type RegisterState,
} from '../../components/shell/register-state';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import { pointsChanged } from '../points-changed';
import { env } from '../../env';
import { now } from '../clock';
import { checkCode } from '../code-check';
// Not '../db': lint reads that as packages/db (eslint.config.js).
import { getDb } from '../../server/db';
import { cryptoDice } from '../dice';
import { errorKind } from '../error-kind';
import { formText } from '../request/form-input';
import { startSession } from '../session/session';
import { SIGN_IN_TEXT, throttledText } from '../sign-in/texts';
import { throttle } from '../sign-in/throttle';
import { forgetIntended } from './intended';
import {
  clearPendingRegistration,
  readPendingRegistration,
} from './pending-registration';
import { registrationOpenAt } from './registration-window';
import { REGISTER_TEXT } from './texts';

const codeRefused = (message: string): RegisterState => ({
  kind: 'code-refused',
  message,
});

/**
 * RegisteredUserController::confirm: throttled by the pending address
 * first; the code required; a registration to confirm; registration still
 * open (checked again: the account comes into being now - if not, the
 * pending registration is forgotten and the visitor goes home); one full
 * hash comparison, against the dummy when no `registration` code is live,
 * then the atomic claim - one answer for every failure. Then the account,
 * its settings and its tournament in one transaction (createAccount, under
 * the live rule set): taken - forgotten, start again; any other failure -
 * kept, so a new code finishes it (sportbet issue 270), logged by its kind
 * only; done - forgotten, signed in on a new session, audited as
 * `register` (without the IP, R-45), home.
 */
export async function confirmRegistration(
  form: FormData,
  ip: string,
): Promise<RegisterState> {
  const db = getDb();
  const at = now();
  const jar = await cookies();
  const pending = readPendingRegistration(jar, env().AUTH_SECRET, at);
  const verdict = await throttle(
    db,
    registerConfirmLimits(pending?.email ?? null, ip),
    at,
  );
  if (!verdict.allowed) return codeRefused(throttledText(verdict.minutes));
  const code = formText(form, 'code');
  // 4b's text (#16, Q2); sportbet: "The code field is required."
  if (code === '') return codeRefused(SIGN_IN_TEXT.codeRequired);
  if (pending === null) return codeRefused(REGISTER_TEXT.noPending);
  if (!(await registrationOpenAt(at))) {
    clearPendingRegistration(jar);
    redirect('/');
  }
  const checked = await checkCode(db, {
    email: pending.email,
    purpose: 'registration',
    code,
    now: at,
  });
  if (checked === 'refused') return codeRefused(SIGN_IN_TEXT.wrongCode);
  const created = await createAccount(db, pending, {
    now: at,
    rules: ruledRules,
    dice: cryptoDice,
  }).catch((error: unknown) => {
    console.error(
      `registration: the account could not be created (${errorKind(error)})`,
    );
    return null;
  });
  if (created === null) return codeRefused(REGISTER_TEXT.failed);
  if (!created.ok) {
    clearPendingRegistration(jar);
    return {
      kind: 'refused',
      errors: { email: REGISTER_TEXT.taken },
      values: EMPTY_REGISTER_VALUES,
    };
  }
  // The new account joined its tournament, its fill-ins scored.
  pointsChanged();
  clearPendingRegistration(jar);
  forgetIntended(jar);
  await startSession(db, jar, created.value.player, at);
  await recordLogin(db, {
    player: created.value.player,
    method: 'register',
    at,
  });
  redirect(PLAYER_HOME);
}
