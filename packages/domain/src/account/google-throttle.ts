import type { ThrottleLimit } from './sign-in-throttle';

const TEN_MINUTES = 10 * 60;

/**
 * `GET /auth/google` (slice 19, #40): 20 per 10 minutes per IP. sportbet has
 * none; the start mints a state, so it is bounded. IP only: nothing about a
 * person is known before the exchange.
 */
export function googleStartLimits(ip: string): readonly ThrottleLimit[] {
  return [
    {
      key: `google-start:ip:${ip}`,
      maxAttempts: 20,
      windowSeconds: TEN_MINUTES,
    },
  ];
}

/**
 * `GET /auth/google/callback`: 30 per 10 minutes per IP, checked first. The
 * callback makes an outbound request per call; one refused for its cookie or
 * its state is counted but makes none.
 */
export function googleCallbackLimits(ip: string): readonly ThrottleLimit[] {
  return [
    {
      key: `google-callback:ip:${ip}`,
      maxAttempts: 30,
      windowSeconds: TEN_MINUTES,
    },
  ];
}
