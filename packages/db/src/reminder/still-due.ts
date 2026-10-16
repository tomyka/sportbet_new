import type { GameId, PlayerId } from '@sportbet/domain';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { gameOf, keyOf } from '../edge';
import { matchPredictions } from '../prediction/schema';
import { games } from '../season/schema';

const idRows = z.array(z.object({ game: z.int() }));

/**
 * Which of the player's listed games are still due a reminder, read just
 * before their mail goes out: the row is still unanswered and unmarked, the
 * game has no result and has not started (at the database's clock). A game
 * answered, reminded or finished while the run was sending to others is
 * left out, so the mail never names it.
 */
export async function stillDueGames(
  db: Executor,
  due: { readonly player: PlayerId; readonly games: readonly GameId[] },
): Promise<readonly GameId[]> {
  if (due.games.length === 0) return [];
  const rows = idRows.parse(
    await db
      .select({ game: matchPredictions.gameId })
      .from(matchPredictions)
      .innerJoin(games, eq(games.id, matchPredictions.gameId))
      .where(
        and(
          eq(matchPredictions.playerId, keyOf(due.player, 'player')),
          inArray(matchPredictions.gameId, [...due.games]),
          isNull(matchPredictions.remindedAt),
          or(isNull(matchPredictions.home), isNull(matchPredictions.away)),
          isNull(games.homeScore),
          gt(games.tipOff, sql`now()`),
        ),
      ),
  );
  const open = new Set(rows.map(({ game }) => gameOf(game)));
  return due.games.filter((game) => open.has(game));
}
