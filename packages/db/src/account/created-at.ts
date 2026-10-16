import type { Instant, PlayerId } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { inChunks, keyOf } from '../edge';

/** When sportbet created an account (`users.created_at`, UTC). */
export interface CreatedRow {
  readonly player: PlayerId;
  readonly at: Instant;
}

/**
 * Restores sportbet's `users.created_at` onto the players the reader just
 * saved (R-114, "Narys nuo"), the moment kept as it was. An account made
 * here is stamped by the database when it is inserted, and no other writer
 * moves the column. Rows naming a player that is not saved change nothing.
 */
export async function restoreCreatedAt(
  db: Executor,
  rows: readonly CreatedRow[],
): Promise<void> {
  const keyed = rows.map(({ player, at }) => ({
    player: keyOf(player, 'player'),
    at: new Date(at).toISOString(),
  }));
  await inChunks(keyed, (chunk) =>
    db.execute(sql`
      update players as p
      set created_at = restored.at
      from (values ${sql.join(
        chunk.map(
          ({ player, at }) => sql`(${player}::integer, ${at}::timestamptz)`,
        ),
        sql`, `,
      )}) as restored (player_id, at)
      where p.id = restored.player_id
    `),
  );
}
