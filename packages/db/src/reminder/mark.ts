import type { GameId, PlayerId } from '@sportbet/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { matchPredictions } from '../prediction/schema';

/**
 * Marks the player's listed games reminded, at the database's own clock,
 * right after their mail went out (sportbet's `reminded_at`, issue 230): a
 * crash re-sends at most the one mail in flight. Touches `reminded_at` of
 * those rows and nothing else.
 */
export async function markReminded(
  db: Executor,
  mark: { readonly player: PlayerId; readonly games: readonly GameId[] },
): Promise<void> {
  if (mark.games.length === 0) return;
  await db
    .update(matchPredictions)
    .set({ remindedAt: sql`now()` })
    .where(
      and(
        eq(matchPredictions.playerId, keyOf(mark.player, 'player')),
        inArray(matchPredictions.gameId, [...mark.games]),
      ),
    );
}
