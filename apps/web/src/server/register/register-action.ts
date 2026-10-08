'use server';

import { cookies, headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import {
  REGISTER_IDLE,
  type RegisterState,
} from '../../components/shell/register-state';
import { actionFailed } from '../error-kind';
import { clientIp } from '../request/client-ip';
import { formText } from '../request/form-input';
import { isSameOrigin } from '../request/same-origin';
import { signedInPlayer } from '../request-context';
import { confirmRegistration } from './confirm-registration';
import { clearPendingRegistration } from './pending-registration';
import { requestRegistration } from './request-registration';

/**
 * The dialog's registration Server Action (spec 4c): step one (and its
 * resend), step two, or back out, by the form's `intent`. A request from
 * another origin is refused before anything happens (#16), and a
 * signed-in visitor goes to '/', as sportbet's `guest` middleware sent
 * them. Anything else that fails is logged by its kind and rethrown bare
 * (actionFailed, review W2):
 * a database error's message quotes its parameters, the answers among
 * them.
 */
export async function registerAction(
  _state: RegisterState,
  form: FormData,
): Promise<RegisterState> {
  const requestHeaders = await headers();
  if (!isSameOrigin(requestHeaders)) {
    throw new Error('registration: refused a request from another origin');
  }
  try {
    return await answer(form, clientIp(requestHeaders));
  } catch (error) {
    // redirect() throws too: Next's own errors go on as they are.
    unstable_rethrow(error);
    throw actionFailed('registration', error);
  }
}

async function answer(form: FormData, ip: string): Promise<RegisterState> {
  if ((await signedInPlayer()) !== null) redirect('/');
  const intent = formText(form, 'intent');
  if (intent === 'request') return requestRegistration(form, ip);
  if (intent === 'confirm') return confirmRegistration(form, ip);
  if (intent === 'cancel') {
    // RegisteredUserController::cancel: forget the pending registration.
    clearPendingRegistration(await cookies());
  }
  return REGISTER_IDLE;
}
