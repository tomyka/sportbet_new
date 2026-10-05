import { describe, expect, it } from 'vitest';
import { secondsAfter } from '../shared/instant';
import { at } from '../testing';
import {
  codeStepCounters,
  LOGIN_CODE_DIGITS,
  LOGIN_CODE_PURPOSES,
  LOGIN_CODE_TTL_MINUTES,
  loginCodeExpiresAt,
  RESEND_COOLDOWN_SECONDS,
} from './login-code';

const SENT = at('2026-10-05T12:00:00Z');

describe('a login code', () => {
  it('is eight digits and lives five minutes (OneTimeCodeService, #36, #77)', () => {
    expect(LOGIN_CODE_DIGITS).toBe(8);
    expect(LOGIN_CODE_TTL_MINUTES).toBe(5);
    expect(loginCodeExpiresAt(SENT)).toBe(at('2026-10-05T12:05:00Z'));
  });

  it('can be resent well before it dies (LoginCodeStepTest, #76)', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(20);
    expect(RESEND_COOLDOWN_SECONDS * 2).toBeLessThan(
      LOGIN_CODE_TTL_MINUTES * 60,
    );
  });

  it('has one purpose per flow, and 4b issues only login (#43)', () => {
    expect(LOGIN_CODE_PURPOSES).toEqual([
      'login',
      'registration',
      'account_deletion',
      'email_change',
    ]);
  });
});

// sportbet's AuthCodeStepCountersTest.
describe('codeStepCounters', () => {
  it('just sent: the full cooldown and lifetime remain', () => {
    expect(codeStepCounters(SENT, SENT)).toEqual({
      resendIn: 20,
      expiresIn: 300,
    });
  });

  it('partway through: both count down', () => {
    expect(codeStepCounters(SENT, secondsAfter(SENT, 12))).toEqual({
      resendIn: 8,
      expiresIn: 288,
    });
  });

  it('past the cooldown: a resend is allowed while the code still lives', () => {
    expect(codeStepCounters(SENT, secondsAfter(SENT, 25))).toEqual({
      resendIn: 0,
      expiresIn: 275,
    });
  });

  it('past the lifetime: both are zero, never negative', () => {
    expect(codeStepCounters(SENT, secondsAfter(SENT, 301))).toEqual({
      resendIn: 0,
      expiresIn: 0,
    });
  });

  it('a send time ahead of the clock counts as just sent', () => {
    expect(codeStepCounters(secondsAfter(SENT, 5), SENT)).toEqual({
      resendIn: 20,
      expiresIn: 300,
    });
  });
});
