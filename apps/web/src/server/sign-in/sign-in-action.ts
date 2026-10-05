'use server';

import { cookies, headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import {
  SIGN_IN_IDLE,
  type SignInState,
} from '../../components/shell/sign-in-state';
import { errorKind } from '../error-kind';
import { clientIp } from '../request/client-ip';
import { formText } from '../request/form-input';
import { isSameOrigin } from '../request/same-origin';
import { signedInPlayer } from '../request-context';
import { clearPending } from './pending';
import { requestCode } from './request-code';
import { verifyCode } from './verify-code';

/**
 * The sign-in dialog's one Server Action (spec 4b): ask for a code, type
 * it, or back out, by the form's `intent`. A request from another origin
 * is refused before anything happens (#16; Next lets one without an
 * Origin through), and a signed-in visitor goes to '/', as sportbet's
 * `guest` middleware sent them. Anything else that fails is logged by its
 * kind and rethrown bare (review W2): a database error's message quotes
 * its parameters, the typed address among them.
 */
export async function signInAction(
  _state: SignInState,
  form: FormData,
): Promise<SignInState> {
  const requestHeaders = await headers();
  if (!isSameOrigin(requestHeaders)) {
    throw new Error('sign-in: refused a request from another origin');
  }
  try {
    return await answer(form, clientIp(requestHeaders));
  } catch (error) {
    // redirect() throws too: Next's own errors go on as they are.
    unstable_rethrow(error);
    console.error(`sign-in: the action failed (${errorKind(error)})`);
    // eslint-disable-next-line preserve-caught-error -- its message, or its cause's, can quote the typed address (review W2)
    throw new Error('sign-in: the action failed');
  }
}

async function answer(form: FormData, ip: string): Promise<SignInState> {
  if ((await signedInPlayer()) !== null) redirect('/');
  const intent = formText(form, 'intent');
  if (intent === 'request') return requestCode(form, ip);
  if (intent === 'verify') return verifyCode(form, ip);
  if (intent === 'cancel') {
    // EmailCodeLoginController::cancel: forget the step.
    clearPending(await cookies());
  }
  return SIGN_IN_IDLE;
}
