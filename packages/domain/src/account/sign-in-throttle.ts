import { normalizeEmail } from './email';

/** One fixed window of a throttle: its key, how many attempts, how long. */
export interface ThrottleLimit {
  /** The key as text; the caller stores only its hash. */
  readonly key: string;
  readonly maxAttempts: number;
  readonly windowSeconds: number;
}

/** sportbet's `Limit::perMinutes(10, ...)`: every sign-in window is ten minutes. */
const TEN_MINUTES = 10 * 60;

/** sportbet's `Limit::perMinute(...)`. */
const ONE_MINUTE = 60;

/**
 * An address's key, or for a blank one its own per-IP key - not the shared
 * IP one, and not one bucket every blank request shares (AppServiceProvider).
 */
const addressKey = (email: string, ip: string) =>
  email === '' ? `blank-email-ip:${ip}` : `email:${email}`;

/**
 * AppServiceProvider's 'login-code-request': 3 per 10 minutes per address
 * (as typed, normalized), 10 per IP. Checked in this order, the IP limit
 * first: a request it refuses writes no window for the address it names
 * (#16 review).
 */
export function codeRequestLimits(
  typedEmail: string,
  ip: string,
): readonly ThrottleLimit[] {
  return [
    {
      key: `login-code-request:ip:${ip}`,
      maxAttempts: 10,
      windowSeconds: TEN_MINUTES,
    },
    {
      key: `login-code-request:${addressKey(normalizeEmail(typedEmail), ip)}`,
      maxAttempts: 3,
      windowSeconds: TEN_MINUTES,
    },
  ];
}

/**
 * AppServiceProvider's 'login-code-verify': 5 per 10 minutes per pending
 * address (the code's own life twice over), 15 per IP. Checked in this
 * order, the IP limit first, as for a request.
 */
export function codeVerifyLimits(
  pendingEmail: string | null,
  ip: string,
): readonly ThrottleLimit[] {
  return [
    {
      key: `login-code-verify:ip:${ip}`,
      maxAttempts: 15,
      windowSeconds: TEN_MINUTES,
    },
    {
      key: `login-code-verify:${addressKey(normalizeEmail(pendingEmail ?? ''), ip)}`,
      maxAttempts: 5,
      windowSeconds: TEN_MINUTES,
    },
  ];
}

/**
 * AppServiceProvider's 'register' (step one, #102, issue 260): 3 per 10
 * minutes per address as typed, normalized (EmailIdentity::normalize), so
 * one address cannot be mailed more than three codes whatever its
 * spelling, and 3 a minute per IP. The IP limit first, as for sign-in.
 */
export function registerRequestLimits(
  typedEmail: string,
  ip: string,
): readonly ThrottleLimit[] {
  return [
    {
      key: `register:ip:${ip}`,
      maxAttempts: 3,
      windowSeconds: ONE_MINUTE,
    },
    {
      key: `register:${addressKey(normalizeEmail(typedEmail), ip)}`,
      maxAttempts: 3,
      windowSeconds: TEN_MINUTES,
    },
  ];
}

/** AppServiceProvider's 'register-page': /register, 10 a minute per IP. */
export function registerPageLimits(ip: string): readonly ThrottleLimit[] {
  return [
    {
      key: `register-page:ip:${ip}`,
      maxAttempts: 10,
      windowSeconds: ONE_MINUTE,
    },
  ];
}

/**
 * AppServiceProvider's 'register-confirm' (#102): 5 per 10 minutes per
 * pending address - tighter than sign-in's, the code is in front of the
 * person typing it - else per `no-pending-ip:<ip>`, and 15 per IP. The IP
 * limit first, as for sign-in.
 */
export function registerConfirmLimits(
  pendingEmail: string | null,
  ip: string,
): readonly ThrottleLimit[] {
  const email = normalizeEmail(pendingEmail ?? '');
  return [
    {
      key: `register-confirm:ip:${ip}`,
      maxAttempts: 15,
      windowSeconds: TEN_MINUTES,
    },
    {
      key: `register-confirm:${email === '' ? `no-pending-ip:${ip}` : `email:${email}`}`,
      maxAttempts: 5,
      windowSeconds: TEN_MINUTES,
    },
  ];
}

/**
 * The minutes a refused visitor is told to wait (sportbet's "Per daug
 * bandymų. Pabandykite dar kartą po N min."): the refusing window's rest,
 * rounded up, at least one.
 */
export function throttledMinutes(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60));
}
