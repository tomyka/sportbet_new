import { ok, refuse, type PlayerId, type Result } from '@sportbet/domain';
import { eq } from 'drizzle-orm';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { playerSettings } from './schema';

/**
 * The only writer of `receive_reminders` (R-97, R-98): turns a player's
 * prediction reminders on or off, and says `unknown-player` when no
 * account has them (deleted since a mail was sent). Setting what is
 * already set succeeds the same way.
 */
export async function setReceiveReminders(
  db: Executor,
  write: { readonly player: PlayerId; readonly on: boolean },
): Promise<Result<void, 'unknown-player'>> {
  const changed = await db
    .update(playerSettings)
    .set({ receiveReminders: write.on })
    .where(eq(playerSettings.playerId, keyOf(write.player, 'player')))
    .returning({ player: playerSettings.playerId });
  return changed.length === 0 ? refuse('unknown-player') : ok(undefined);
}
