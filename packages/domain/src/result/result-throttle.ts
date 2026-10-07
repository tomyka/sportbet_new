import type { ThrottleLimit } from '../account/sign-in-throttle';
import type { PlayerId } from '../shared/ids';

/**
 * R-69: a results manager's accepted results saves, 30 a minute (a few
 * dozen, as the owner ruled). Counted after the form check, so a mistyped
 * box costs nothing. sportbet sets no limit.
 */
export function resultSaveLimits(player: PlayerId): readonly ThrottleLimit[] {
  return [
    {
      key: `result-save:player:${player}`,
      maxAttempts: 30,
      windowSeconds: 60,
    },
  ];
}

/**
 * R-69: "Perskaičiuoti taškus", twice a minute per account - it rescores
 * every tournament not frozen. sportbet sets no limit.
 */
export function recalculateAllLimits(
  player: PlayerId,
): readonly ThrottleLimit[] {
  return [
    {
      key: `recalculate-all:player:${player}`,
      maxAttempts: 2,
      windowSeconds: 60,
    },
  ];
}
