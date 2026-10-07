import type { ThrottleLimit } from '../account/sign-in-throttle';
import type { PlayerId } from '../shared/ids';

/**
 * The tournament join submit's throttle: 60 submits a minute per account,
 * checked before anything is read. Not sportbet's (it has none): a
 * hardening from slice 8's security review, as predictionSaveLimits is.
 */
export function joinSubmitLimits(player: PlayerId): readonly ThrottleLimit[] {
  return [
    {
      key: `join-submit:player:${player}`,
      maxAttempts: 60,
      windowSeconds: 60,
    },
  ];
}
