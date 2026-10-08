import type { SignInState } from '../../components/shell/sign-in-state';
import type { PendingSignIn } from './pending';
import { refused, SIGN_IN_TEXT, throttledText } from './texts';
import type { ThrottleVerdict } from './throttle';

/**
 * EmailCodeLoginController::verify before any code is checked, in its
 * order, each answered on the code: the throttle (by the pending address
 * and the IP), a code typed, and an address the code went to.
 */
export function beforeTheLoginCode(input: {
  readonly verdict: ThrottleVerdict;
  readonly code: string;
  readonly pending: PendingSignIn | null;
}):
  | { readonly ok: true; readonly pending: PendingSignIn }
  | { readonly ok: false; readonly state: SignInState } {
  const { verdict, code, pending } = input;
  if (!verdict.allowed) {
    return {
      ok: false,
      state: refused('code', throttledText(verdict.minutes)),
    };
  }
  if (code === '') {
    return { ok: false, state: refused('code', SIGN_IN_TEXT.codeRequired) };
  }
  if (pending === null) {
    return { ok: false, state: refused('code', SIGN_IN_TEXT.noPendingEmail) };
  }
  return { ok: true, pending };
}
