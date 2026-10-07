import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import { joinSubmitLimits } from './join-throttle';

// Security hardening (slice 8's review): sportbet has no throttle on the
// tournament join submit.

describe('joinSubmitLimits', () => {
  it('throttle: 60 join submits a minute per account', () => {
    expect(joinSubmitLimits(player('7'))).toEqual([
      { key: 'join-submit:player:7', maxAttempts: 60, windowSeconds: 60 },
    ]);
  });

  it('throttle: each account has its own window', () => {
    expect(joinSubmitLimits(player('7'))[0]?.key).not.toBe(
      joinSubmitLimits(player('8'))[0]?.key,
    );
  });
});
