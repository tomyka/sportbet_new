import {
  ok,
  refuse,
  type GoogleId,
  type PlayerId,
  type Result,
} from '@sportbet/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, playerOf } from '../edge';
import { players } from '../player/schema';
import { violatedUnique } from '../sql-state';

const idRows = z.array(z.object({ id: z.int() }));
const linkRows = z.array(z.object({ googleId: z.string().nullable() }));

/**
 * The account linked to this Google `sub` (`users.google_id`), by exact
 * equality: a `sub` differing only in case is another `sub`. Undefined when
 * none is. The only way a Google sign-in finds an account by `sub`.
 */
export async function findAccountByGoogleId(
  db: Executor,
  googleId: GoogleId,
): Promise<{ readonly player: PlayerId } | undefined> {
  const [row] = idRows.parse(
    await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.googleId, googleId))
      .limit(1),
  );
  return row === undefined ? undefined : { player: playerOf(row.id) };
}

export type GoogleLinkRefusal = 'already-linked' | 'taken' | 'unknown-player';

/**
 * Links the account to a Google `sub` (slice 19, #40): one statement,
 * `UPDATE players SET google_id = $sub WHERE id = $player AND google_id IS
 * NULL`, so it never overwrites (R-135: sportbet did; a different Google
 * account on the address is `already-linked`) and holds one row lock and no
 * other, with no place in the lock order. Linking the same `sub` again is
 * `linked` (nothing changes); a `sub` that belongs to another account is
 * `taken` (the unique index decides, so two linking at once leave one winner).
 */
export async function linkGoogleId(
  db: Executor,
  link: { readonly player: PlayerId; readonly googleId: GoogleId },
): Promise<Result<'linked', GoogleLinkRefusal>> {
  const key = keyOf(link.player, 'player');
  try {
    const updated = idRows.parse(
      await db
        .update(players)
        .set({ googleId: link.googleId })
        .where(and(eq(players.id, key), isNull(players.googleId)))
        .returning({ id: players.id }),
    );
    if (updated.length > 0) return ok('linked');
    const [row] = linkRows.parse(
      await db
        .select({ googleId: players.googleId })
        .from(players)
        .where(eq(players.id, key)),
    );
    if (row === undefined) return refuse('unknown-player');
    return row.googleId === link.googleId
      ? ok('linked')
      : refuse('already-linked');
  } catch (error) {
    if (violatedUnique(error) === 'players_google_id_unique') {
      return refuse('taken');
    }
    throw error;
  }
}
