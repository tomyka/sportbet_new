import { codeStepCounters, type Instant } from '@sportbet/domain';
import type {
  DialogTab,
  SignInStep,
} from '../../components/shell/sign-in-state';
import { isoSecond } from '../clock';
import type { PendingRegistration } from '../register/pending-registration';
import type { PendingSignIn } from './pending';

/** The tab an open-the-dialog value names: `register` is /register's, anything else the sign-in's. */
export function dialogTabOf(value: string | null | undefined): DialogTab {
  return value === 'register' ? 'register' : 'login';
}

const alive = (sentAt: Instant, now: Instant) =>
  codeStepCounters(sentAt, now).expiresIn > 0;

/**
 * AuthDialogComposer: the code step of a pending sign-in or registration
 * while its code lives - an expired one is dropped, so a dead countdown
 * never opens over a page - and with both alive, the one asked for last,
 * a tie to the registration (`$registration['sentAt'] >= $login['sentAt']`);
 * else the forms.
 */
export function dialogStep(
  login: PendingSignIn | null,
  registration: PendingRegistration | null,
  now: Instant,
): SignInStep {
  const signIn = login !== null && alive(login.sentAt, now) ? login : null;
  const register =
    registration !== null && alive(registration.sentAt, now)
      ? registration
      : null;
  if (
    register !== null &&
    (signIn === null || register.sentAt >= signIn.sentAt)
  ) {
    return {
      kind: 'register-code',
      email: register.email,
      username: register.username,
      name: register.name,
      surname: register.surname,
      sentAt: isoSecond(register.sentAt),
      ...codeStepCounters(register.sentAt, now),
    };
  }
  if (signIn !== null) {
    return {
      kind: 'code',
      email: signIn.email,
      sentAt: isoSecond(signIn.sentAt),
      ...codeStepCounters(signIn.sentAt, now),
    };
  }
  return { kind: 'email' };
}
