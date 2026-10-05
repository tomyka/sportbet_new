import { expect, it } from 'vitest';
import { at } from '../testing';
import {
  AUDIT_LOGIN_METHODS,
  SESSION_LIFETIME_DAYS,
  sessionExpiresAt,
  utcDay,
} from './session';

it('R-44: a sign-in lasts 90 days from the last visit', () => {
  expect(SESSION_LIFETIME_DAYS).toBe(90);
  expect(sessionExpiresAt(at('2026-10-05T12:00:00Z'))).toBe(
    at('2027-01-03T12:00:00Z'),
  );
});

it('names the UTC day an instant falls on, at either end of it', () => {
  expect(utcDay(at('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
  expect(utcDay(at('2026-10-05T23:59:59Z'))).toBe('2026-10-05');
});

it('records a code sign-in as email_code and a registration as register, as sportbet does', () => {
  expect(AUDIT_LOGIN_METHODS).toEqual(['email_code', 'register']);
});
