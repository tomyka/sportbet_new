import type { PlayerId } from '../shared/ids';
import type { ThrottleLimit } from './sign-in-throttle';

const TEN_MINUTES = 10 * 60;

function limit(key: string, maxAttempts: number): ThrottleLimit {
  return { key, maxAttempts, windowSeconds: TEN_MINUTES };
}

/**
 * AppServiceProvider's 'account-deletion-code-request': 10 per IP, then 3 per
 * account, per 10 minutes. The IP limit first, as for sign-in.
 */
export function deletionCodeRequestLimits(
  player: PlayerId,
  ip: string,
): readonly ThrottleLimit[] {
  return [
    limit(`account-deletion-code-request:ip:${ip}`, 10),
    limit(`account-deletion-code-request:user:${player}`, 3),
  ];
}

/** 'account-deletion-verify': 15 per IP, then 5 per account, per 10 minutes. */
export function deletionVerifyLimits(
  player: PlayerId,
  ip: string,
): readonly ThrottleLimit[] {
  return [
    limit(`account-deletion-verify:ip:${ip}`, 15),
    limit(`account-deletion-verify:user:${player}`, 5),
  ];
}

/**
 * The address change's request (`email-change-request:<id>`): 3 per account
 * per 10 minutes, counted only when the address changed and answered in the
 * form, so no IP key.
 */
export function emailChangeRequestLimits(
  player: PlayerId,
): readonly ThrottleLimit[] {
  return [limit(`email-change-request:${player}`, 3)];
}

/** 'email-change-verify': 15 per IP, then 5 per account, per 10 minutes. */
export function emailChangeVerifyLimits(
  player: PlayerId,
  ip: string,
): readonly ThrottleLimit[] {
  return [
    limit(`email-change-verify:ip:${ip}`, 15),
    limit(`email-change-verify:user:${player}`, 5),
  ];
}
