import type { ThrottleLimit } from '../account/sign-in-throttle';
import type { PlayerId } from '../shared/ids';

/**
 * The prediction save's throttle: 60 saves a minute per player, checked
 * before anything is read. Not sportbet's (it has none on saves): a
 * hardening the lead decided in slice 6. A player who types and clears a
 * whole round in a minute stays far below it.
 */
export function predictionSaveLimits(
  player: PlayerId,
): readonly ThrottleLimit[] {
  return [
    {
      key: `prediction-save:player:${player}`,
      maxAttempts: 60,
      windowSeconds: 60,
    },
  ];
}
