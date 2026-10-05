import { codeStepCounters, LOGIN_CODE_TTL_MINUTES } from '@sportbet/domain';
import { cookies, headers } from 'next/headers';
import type {
  ShellSignIn,
  SignInStep,
} from '../../components/shell/sign-in-state';
import { env } from '../../env';
import { isoSecond, now } from '../clock';
import { OPEN_SIGN_IN_HEADER } from '../cookies';
import { readPending } from './pending';
import { signInAction } from './sign-in-action';

/**
 * What a guest's dialog draws (AuthCodeStep::login, AuthDialogComposer):
 * the code step while a code sent to the address typed is still alive - an
 * expired one is dropped, so a dead countdown never opens over a page -
 * else the address form; open on arrival from /login (proxy.ts's
 * OPEN_SIGN_IN_HEADER) or with a code to type.
 */
export async function signInDialogState(): Promise<ShellSignIn> {
  const jar = await cookies();
  const pending = readPending(jar, env().AUTH_SECRET);
  const opened = (await headers()).get(OPEN_SIGN_IN_HEADER) !== null;
  const counters =
    pending === null ? null : codeStepCounters(pending.sentAt, now());
  const step: SignInStep =
    pending !== null && counters !== null && counters.expiresIn > 0
      ? {
          kind: 'code',
          email: pending.email,
          sentAt: isoSecond(pending.sentAt),
          resendIn: counters.resendIn,
          expiresIn: counters.expiresIn,
        }
      : { kind: 'email' };
  return {
    step,
    open: step.kind === 'code' || opened,
    codeMinutes: LOGIN_CODE_TTL_MINUTES,
    action: signInAction,
  };
}
