import type { RegisterState } from '../../components/shell/register-state';
import { SIGN_IN_TEXT, throttledText } from '../sign-in/texts';
import type { ThrottleVerdict } from '../sign-in/throttle';
import type { PendingRegistration } from './pending-registration';
import { REGISTER_TEXT } from './texts';

/** A refused code step: its message where the code is typed. */
export const codeRefused = (message: string): RegisterState => ({
  kind: 'code-refused',
  message,
});

/**
 * RegisteredUserController::confirm before any code is checked, in its
 * order: the throttle (by the pending address and the IP), a code typed
 * (4b's text, #16, Q2; sportbet: "The code field is required."), and a
 * registration to confirm.
 */
export function beforeTheCode(input: {
  readonly verdict: ThrottleVerdict;
  readonly code: string;
  readonly pending: PendingRegistration | null;
}):
  | { readonly ok: true; readonly pending: PendingRegistration }
  | { readonly ok: false; readonly state: RegisterState } {
  const { verdict, code, pending } = input;
  if (!verdict.allowed) {
    return { ok: false, state: codeRefused(throttledText(verdict.minutes)) };
  }
  if (code === '') {
    return { ok: false, state: codeRefused(SIGN_IN_TEXT.codeRequired) };
  }
  if (pending === null) {
    return { ok: false, state: codeRefused(REGISTER_TEXT.noPending) };
  }
  return { ok: true, pending };
}
