import type { ThrottleLimit } from '../account/sign-in-throttle';
import type { PlayerId } from '../shared/ids';

/**
 * The standings saves' throttle: 120 saves a minute per player, the row
 * save and the reorder together, checked before anything is read. Not
 * sportbet's (it has none): the slice 6 hardening. 120, not
 * predictionSaveLimits' 60, as a ladder move is a save; the page sends one
 * reorder once arrow presses pause.
 */
export function standingsSaveLimits(
  player: PlayerId,
): readonly ThrottleLimit[] {
  return [
    {
      key: `standings-save:player:${player}`,
      maxAttempts: 120,
      windowSeconds: 60,
    },
  ];
}
