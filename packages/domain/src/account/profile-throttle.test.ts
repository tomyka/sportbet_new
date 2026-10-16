import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import {
  deletionCodeRequestLimits,
  deletionVerifyLimits,
  emailChangeRequestLimits,
  emailChangeVerifyLimits,
} from './profile-throttle';

const WHO = player('7');
const IP = '203.0.113.7';

describe('the profile throttles (AppServiceProvider)', () => {
  it('a deletion code request: 10 per IP, then 3 per account, per 10 minutes', () => {
    expect(deletionCodeRequestLimits(WHO, IP)).toEqual([
      {
        key: 'account-deletion-code-request:ip:203.0.113.7',
        maxAttempts: 10,
        windowSeconds: 600,
      },
      {
        key: 'account-deletion-code-request:user:7',
        maxAttempts: 3,
        windowSeconds: 600,
      },
    ]);
  });

  it('a deletion verify: 15 per IP, then 5 per account', () => {
    expect(deletionVerifyLimits(WHO, IP)).toEqual([
      {
        key: 'account-deletion-verify:ip:203.0.113.7',
        maxAttempts: 15,
        windowSeconds: 600,
      },
      {
        key: 'account-deletion-verify:user:7',
        maxAttempts: 5,
        windowSeconds: 600,
      },
    ]);
  });

  it('an address change request: 3 per account, no IP', () => {
    expect(emailChangeRequestLimits(WHO)).toEqual([
      { key: 'email-change-request:7', maxAttempts: 3, windowSeconds: 600 },
    ]);
  });

  it('an address change verify: 15 per IP, then 5 per account', () => {
    expect(emailChangeVerifyLimits(WHO, IP)).toEqual([
      {
        key: 'email-change-verify:ip:203.0.113.7',
        maxAttempts: 15,
        windowSeconds: 600,
      },
      {
        key: 'email-change-verify:user:7',
        maxAttempts: 5,
        windowSeconds: 600,
      },
    ]);
  });

  it('keeps every key distinct, so the flows never share a window', () => {
    const keys = [
      ...deletionCodeRequestLimits(WHO, IP),
      ...deletionVerifyLimits(WHO, IP),
      ...emailChangeRequestLimits(WHO),
      ...emailChangeVerifyLimits(WHO, IP),
    ].map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
