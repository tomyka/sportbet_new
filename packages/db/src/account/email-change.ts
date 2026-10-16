import {
  ok,
  refuse,
  storedEmailAddress,
  type EmailAddress,
  type PlayerId,
  type Result,
} from '@sportbet/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, stored } from '../edge';
import { players } from '../player/schema';
import { violatedUnique } from '../sql-state';
import { takeRegistrationLock } from './profile';
import { isEmailRegistered } from './registration';

/**
 * ProfileService::requestEmailChange's last step: parks the normalized
 * address in `pending_email`, called only once its code was mailed to it, so
 * a failed send leaves nothing pending. The live address is untouched. The
 * column is written only here, by `confirmEmailChange` and by
 * `cancelEmailChange`.
 */
export async function requestEmailChange(
  db: Executor,
  at: { readonly player: PlayerId; readonly address: EmailAddress },
): Promise<void> {
  await db
    .update(players)
    .set({ pendingEmail: at.address })
    .where(eq(players.id, keyOf(at.player, 'player')));
}

/** Drops a pending change without touching the account's live address. */
export async function cancelEmailChange(
  db: Executor,
  player: PlayerId,
): Promise<void> {
  await db
    .update(players)
    .set({ pendingEmail: null })
    .where(eq(players.id, keyOf(player, 'player')));
}

const lockedRows = z.array(
  z.object({ email: z.string(), pendingEmail: z.string().nullable() }),
);
type Confirmation = Result<{ readonly old: EmailAddress }, 'none' | 'taken'>;

/**
 * ProfileService::confirmEmailChange's write, after `checkCode` claimed the
 * pending address's `email_change` code: in one transaction, the player's
 * row locked, `none` unless it still waits for exactly `pending` (a change
 * cancelled or re-requested meanwhile), `taken` when another account holds
 * the address (a second spelling counts, or the unique index under a
 * race; the code is spent and the pending address stays, as sportbet), else
 * `email` becomes the pending address and `pending_email` is cleared.
 * Answers the old address, for the notice. Sessions are kept.
 */
export async function confirmEmailChange(
  db: Executor,
  at: { readonly player: PlayerId; readonly pending: EmailAddress },
): Promise<Confirmation> {
  const key = keyOf(at.player, 'player');
  try {
    return await db.transaction(async (tx): Promise<Confirmation> => {
      await takeRegistrationLock(tx);
      const [row] = lockedRows.parse(
        await tx
          .select({ email: players.email, pendingEmail: players.pendingEmail })
          .from(players)
          .where(eq(players.id, key))
          .for('update'),
      );
      if (row?.pendingEmail !== at.pending) {
        return refuse('none');
      }
      if (await isEmailRegistered(tx, at.pending, at.player)) {
        return refuse('taken');
      }
      await tx
        .update(players)
        .set({ email: at.pending, pendingEmail: null })
        .where(eq(players.id, key));
      return ok({ old: stored(storedEmailAddress(row.email), 'players', key) });
    });
  } catch (error) {
    // The only unique key this update can break is the address's own index.
    if (violatedUnique(error) !== null) {
      return refuse('taken');
    }
    throw error;
  }
}
