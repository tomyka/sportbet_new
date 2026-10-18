import { describe, expect, it } from 'vitest';
import { googleCallbackLimits, googleStartLimits } from './google-throttle';

describe('the Google throttles', () => {
  it('the start: 20 per 10 minutes per IP', () => {
    expect(googleStartLimits('203.0.113.7')).toEqual([
      {
        key: 'google-start:ip:203.0.113.7',
        maxAttempts: 20,
        windowSeconds: 600,
      },
    ]);
  });

  it('the callback: 30 per 10 minutes per IP', () => {
    expect(googleCallbackLimits('203.0.113.7')).toEqual([
      {
        key: 'google-callback:ip:203.0.113.7',
        maxAttempts: 30,
        windowSeconds: 600,
      },
    ]);
  });

  it('the two never share a window, and one IP never shares with another', () => {
    const keys = [
      ...googleStartLimits('203.0.113.7'),
      ...googleCallbackLimits('203.0.113.7'),
      ...googleStartLimits('203.0.113.8'),
    ].map(({ key }) => key);
    expect(new Set(keys).size).toBe(3);
  });
});
