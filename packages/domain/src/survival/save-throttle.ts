import type { ThrottleLimit } from '../account/sign-in-throttle';
import type { PlayerId } from '../shared/ids';

/**
 * The survival pick save's throttle: 60 accepted saves a minute per player,
 * as the prediction save's (one click is one save). Not sportbet's (it has
 * none): a hardening the lead decided in slice 10.
 */
export function survivalSaveLimits(player: PlayerId): readonly ThrottleLimit[] {
  return [
    {
      key: `survival-save:player:${player}`,
      maxAttempts: 60,
      windowSeconds: 60,
    },
  ];
}
