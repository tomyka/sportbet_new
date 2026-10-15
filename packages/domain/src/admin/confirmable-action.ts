import { z } from 'zod';
import type { ThrottleLimit } from '../account/sign-in-throttle';
import { ROLES } from '../account/role';
import { leagueIdSchema } from '../league/league';
import {
  gameIdSchema,
  idFromText,
  playerIdSchema,
  type PlayerId,
} from '../shared/ids';

/**
 * An account as the cookie names it: the database id as text, nothing the
 * rest of the app could not have read through idFromText, so a tampered
 * cookie never reaches a writer as an id it cannot key.
 */
const accountSchema = z
  .string()
  .refine((text) => idFromText(text).ok, 'not a database id')
  .pipe(playerIdSchema);

/** A league message's id: a whole number a `messages.id` holds. */
const messageIdSchema = z.int().positive().max(2_147_483_647);

/**
 * R-26 amended, R-118: a destructive superadmin action, confirmed with a
 * fresh code emailed at that moment. The cookie that holds the pending
 * action is parsed with this schema; every kind holds exactly its own
 * fields (no extra key survives), and the code is bound to all of them
 * (`actionBinding`).
 */
export const confirmableActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('delete-game'), game: gameIdSchema }),
  z.strictObject({ kind: z.literal('delete-user'), player: accountSchema }),
  z.strictObject({
    kind: z.literal('change-role'),
    player: accountSchema,
    role: z.enum(ROLES),
  }),
  z.strictObject({
    kind: z.literal('delete-league-message'),
    message: messageIdSchema,
  }),
  z.strictObject({ kind: z.literal('delete-league'), league: leagueIdSchema }),
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
