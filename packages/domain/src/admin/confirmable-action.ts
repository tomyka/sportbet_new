import { z } from 'zod';
import type { ThrottleLimit } from '../account/sign-in-throttle';
import { gameIdSchema, type PlayerId } from '../shared/ids';

/**
 * R-26 amended: a destructive superadmin action, confirmed with a fresh
 * code emailed at that moment. The cookie that holds the pending action is
 * parsed with this schema. Slice 14 adds its kinds here (`delete-user`,
 * `change-role`, `delete-league-message`).
 */
export const confirmableActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('delete-game'), game: gameIdSchema }),
]);

export type ConfirmableAction = z.infer<typeof confirmableActionSchema>;

/** Five codes mailed, and ten checks, per ten minutes: the code's own life twice over. */
const TEN_MINUTES = 10 * 60;

/**
 * R-26 amended: the codes mailed for destructive actions, 5 per 10 minutes
 * per admin; counted once the action is allowed, so a refused action sends
 * none.
 */
export function adminConfirmRequestLimits(
  player: PlayerId,
): readonly ThrottleLimit[] {
  return [
    {
      key: `admin-confirm-code:player:${player}`,
      maxAttempts: 5,
      windowSeconds: TEN_MINUTES,
    },
  ];
}

/** R-26 amended: the codes an admin may try against a pending action, 10 per 10 minutes. */
export function adminConfirmCheckLimits(
  player: PlayerId,
): readonly ThrottleLimit[] {
  return [
    {
      key: `admin-confirm-check:player:${player}`,
      maxAttempts: 10,
      windowSeconds: TEN_MINUTES,
    },
  ];
}
