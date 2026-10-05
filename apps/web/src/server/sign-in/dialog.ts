import { LOGIN_CODE_TTL_MINUTES } from '@sportbet/domain';
import { cookies, headers } from 'next/headers';
import type { ShellSignIn } from '../../components/shell/sign-in-state';
import { env } from '../../env';
import { now } from '../clock';
import { OPEN_SIGN_IN_HEADER } from '../cookies';
import { readPendingRegistration } from '../register/pending-registration';
import { registerAction } from '../register/register-action';
import { registrationOpenNow } from '../register/registration-window';
import { dialogStep, dialogTabOf } from './dialog-step';
import { readPending } from './pending';
import { signInAction } from './sign-in-action';

/**
 * What a guest's dialog draws (AuthDialogComposer): the code step asked for
 * last while its code lives (dialogStep), else the forms - the
 * Registruotis tab only while registration is open; open on arrival from
 * /login or /register (proxy.ts's OPEN_SIGN_IN_HEADER, naming the tab) or
 * with a code to type.
 */
export async function signInDialogState(): Promise<ShellSignIn> {
  const jar = await cookies();
  const secret = env().AUTH_SECRET;
  const opened = (await headers()).get(OPEN_SIGN_IN_HEADER);
  const at = now();
  const step = dialogStep(
    readPending(jar, secret, at),
    readPendingRegistration(jar, secret, at),
    at,
  );
  return {
    step,
    open: step.kind !== 'email' || opened !== null,
    tab: dialogTabOf(opened),
    registrationOpen: await registrationOpenNow(),
    codeMinutes: LOGIN_CODE_TTL_MINUTES,
    action: signInAction,
    registerAction,
  };
}
