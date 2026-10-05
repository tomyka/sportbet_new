import { DAY_SECONDS, secondsAfter, type Instant } from '../shared/instant';

/** R-44: a sign-in lasts 90 days from the last visit, and every visit extends it. */
export const SESSION_LIFETIME_DAYS = 90;

/** When a session last seen at `lastSeen` ends. */
export function sessionExpiresAt(lastSeen: Instant): Instant {
  return secondsAfter(lastSeen, SESSION_LIFETIME_DAYS * DAY_SECONDS);
}

/**
 * The UTC calendar day of an instant, `YYYY-MM-DD`. A session is extended
 * at most once a day: its cookie carries the day it was last re-issued.
 */
export function utcDay(instant: Instant): string {
  return new Date(instant).toISOString().slice(0, 10);
}

/**
 * How a player came in, as audit_logins records it (sportbet's
 * `login_method`). 4b writes `email_code`; 4c adds Google's and
 * registration's.
 */
export const AUDIT_LOGIN_METHODS = ['email_code'] as const;

export type AuditLoginMethod = (typeof AUDIT_LOGIN_METHODS)[number];
