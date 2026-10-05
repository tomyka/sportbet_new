import { describe, expect, it } from 'vitest';
import {
  codeRequestLimits,
  codeVerifyLimits,
  registerConfirmLimits,
  registerPageLimits,
  registerRequestLimits,
  throttledMinutes,
} from './sign-in-throttle';

// sportbet's AppServiceProvider: 'login-code-request' and 'login-code-verify'.
describe('the sign-in throttles', () => {
  it('a code request: 3 per 10 minutes per address, 10 per IP', () => {
    expect(codeRequestLimits('  Jonas@Example.LT ', '203.0.113.7')).toEqual([
      {
        key: 'login-code-request:ip:203.0.113.7',
        maxAttempts: 10,
        windowSeconds: 600,
      },
      {
        key: 'login-code-request:email:jonas@example.lt',
        maxAttempts: 3,
        windowSeconds: 600,
      },
    ]);
  });

  it('a blank address counts on its own IP key, not the shared one, nor one bucket for every blank', () => {
    expect(codeRequestLimits('   ', '203.0.113.7')[1]?.key).toBe(
      'login-code-request:blank-email-ip:203.0.113.7',
    );
  });

  it('a verify: 5 per 10 minutes per pending address, 15 per IP', () => {
    expect(codeVerifyLimits('jonas@example.lt', '203.0.113.7')).toEqual([
      {
        key: 'login-code-verify:ip:203.0.113.7',
        maxAttempts: 15,
        windowSeconds: 600,
      },
      {
        key: 'login-code-verify:email:jonas@example.lt',
        maxAttempts: 5,
        windowSeconds: 600,
      },
    ]);
  });

  it('a verify with no pending address counts on its own IP key', () => {
    expect(codeVerifyLimits(null, '203.0.113.7')[1]?.key).toBe(
      'login-code-verify:blank-email-ip:203.0.113.7',
    );
  });
});

// Laravel's ThrottleRequests: the minutes in "Pabandykite dar kartą po N min."
// A request the IP limit refuses must write no window for the address
// it names, so the IP limit is checked, and hit, first (#16 review, W4).
it('checks the IP limit before the address limit, for a request and a verify', () => {
  expect(
    codeRequestLimits('jonas@example.lt', '203.0.113.7').map(({ key }) => key),
  ).toEqual([
    'login-code-request:ip:203.0.113.7',
    'login-code-request:email:jonas@example.lt',
  ]);
  expect(
    codeVerifyLimits('jonas@example.lt', '203.0.113.7').map(({ key }) => key),
  ).toEqual([
    'login-code-verify:ip:203.0.113.7',
    'login-code-verify:email:jonas@example.lt',
  ]);
});

describe('throttledMinutes', () => {
  it.each([
    [570, 10],
    [61, 2],
    [60, 1],
    [1, 1],
    [0, 1],
  ])(
    '%i seconds left is %i minutes, rounded up, at least one',
    (seconds, minutes) => {
      expect(throttledMinutes(seconds)).toBe(minutes);
    },
  );
});

// sportbet's AppServiceProvider: 'register', 'register-page' and
// 'register-confirm' (3eb95e7). The IP limit first, as for sign-in.
describe('the registration throttles', () => {
  it('throttle: step one, 3 per 10 minutes per address as normalized, 3 a minute per IP', () => {
    expect(
      registerRequestLimits('  Ruta.Naujoke@Example.LT ', '203.0.113.7'),
    ).toEqual([
      { key: 'register:ip:203.0.113.7', maxAttempts: 3, windowSeconds: 60 },
      {
        key: 'register:email:ruta.naujoke@example.lt',
        maxAttempts: 3,
        windowSeconds: 600,
      },
    ]);
  });

  it('throttle: step one with a blank address counts on its own IP key', () => {
    expect(registerRequestLimits('', '203.0.113.7')[1]?.key).toBe(
      'register:blank-email-ip:203.0.113.7',
    );
  });

  it('throttle: /register, 10 a minute per IP', () => {
    expect(registerPageLimits('203.0.113.7')).toEqual([
      {
        key: 'register-page:ip:203.0.113.7',
        maxAttempts: 10,
        windowSeconds: 60,
      },
    ]);
  });

  it('throttle: step two, 5 per 10 minutes per pending address, 15 per IP', () => {
    expect(
      registerConfirmLimits('ruta.naujoke@example.lt', '203.0.113.7'),
    ).toEqual([
      {
        key: 'register-confirm:ip:203.0.113.7',
        maxAttempts: 15,
        windowSeconds: 600,
      },
      {
        key: 'register-confirm:email:ruta.naujoke@example.lt',
        maxAttempts: 5,
        windowSeconds: 600,
      },
    ]);
  });

  it('throttle: step two with no pending registration counts on its own IP key', () => {
    expect(registerConfirmLimits(null, '203.0.113.7')[1]?.key).toBe(
      'register-confirm:no-pending-ip:203.0.113.7',
    );
  });
});
