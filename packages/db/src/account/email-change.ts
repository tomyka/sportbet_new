import {
  AddressState,
  refuse,
  storedEmailAddress,
  type EmailAddress,
  type PlayerId,
} from '@sportbet/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, stored } from '../edge';
import { players } from '../player/schema';
import { violatedUnique } from '../sql-state';
import { isEmailRegistered, takeRegistrationLock } from './identity';
import { deleteLoginCodesOf } from './login-codes';
import { endOtherSessions } from './sessions';

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
type Confirmation = ReturnType<AddressState['confirm']>;

/**
 * ProfileService::confirmEmailChange's write, after `checkCode` claimed the
 * pending address's `email_change` code: in one transaction, the player's
 * row locked and the address state decided (AddressState.confirm: `none`
 * unless it still waits for exactly `pending`, `taken` when another account
 * holds the address - a second spelling counts, or the unique index under a
 * race; the code is spent and the pending address stays, as sportbet). A
 * move writes `email`, clears `pending_email`, deletes every code of the
 * old address (exact equality, #41: it is the next holder's secret) and, as
 * R-132 rules, ends every session of the account but `keepSession`'s (the
 * hash of the confirming browser's token). Answers the old address, for the
 * notice.
 */
export async function confirmEmailChange(
  db: Executor,
  at: {
    readonly player: PlayerId;
    readonly pending: EmailAddress;
    readonly keepSession: string | null;
  },
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
      if (row === undefined) return refuse('none');
      const state = AddressState.of(
        stored(storedEmailAddress(row.email), 'players', key),
        row.pendingEmail === null
          ? null
          : stored(storedEmailAddress(row.pendingEmail), 'players', key),
      );
      const decided = state.confirm(
        at.pending,
        await isEmailRegistered(tx, at.pending, at.player),
      );
      if (!decided.ok) return decided;
      await tx
        .update(players)
        .set({ email: decided.value.now, pendingEmail: null })
        .where(eq(players.id, key));
      await deleteLoginCodesOf(tx, decided.value.old);
      await endOtherSessions(tx, at.player, at.keepSession);
      return decided;
    });
  } catch (error) {
    // The only unique key this update can break is the address's own index.
    if (violatedUnique(error) !== null) {
      return refuse('taken');
    }
    throw error;
  }
}
