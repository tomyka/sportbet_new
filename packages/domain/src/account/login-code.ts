import { secondsAfter, type Instant } from '../shared/instant';

/** OneTimeCodeService::DIGITS (#36 item 4): eight digits, a keyspace of 1e8. */
export const LOGIN_CODE_DIGITS = 8;

/** OneTimeCodeService::TTL_MINUTES (#77): a code lives five minutes. */
export const LOGIN_CODE_TTL_MINUTES = 5;

/** EmailCodeLoginController::RESEND_COOLDOWN_SECONDS (#75, #76): well under the code's life. */
export const RESEND_COOLDOWN_SECONDS = 20;

/**
 * LoginCode's purposes. Every lookup is scoped by one (#43), so a code
 * minted for one flow never redeems another. 4b issues `login` only;
 * `registration` is 4c's, `account_deletion` and `email_change` slice
 * 17's (R-24).
 */
export const LOGIN_CODE_PURPOSES = [
  'login',
  'registration',
  'account_deletion',
  'email_change',
] as const;

export type LoginCodePurpose = (typeof LOGIN_CODE_PURPOSES)[number];

/** When a code issued at `issuedAt` stops being redeemable. */
export function loginCodeExpiresAt(issuedAt: Instant): Instant {
  return secondsAfter(issuedAt, LOGIN_CODE_TTL_MINUTES * 60);
}

export interface CodeStepCounters {
  /** Seconds until "siųskite iš naujo" unlocks. */
  readonly resendIn: number;
  /** Seconds the code still lives. */
  readonly expiresIn: number;
}

/**
 * AuthCodeStep::counters: the seconds left, at `now`, of the resend
 * cooldown and of the code's life since it was sent, never negative.
 */
export function codeStepCounters(
  sentAt: Instant,
  now: Instant,
): CodeStepCounters {
  const elapsed = Math.max(0, Math.floor((now - sentAt) / 1000));
  return {
    resendIn: Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed),
    expiresIn: Math.max(0, LOGIN_CODE_TTL_MINUTES * 60 - elapsed),
  };
}
