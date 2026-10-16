import type { GameId, Instant, PlayerId, Tournament } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { inChunks } from '../edge';
import { TournamentScope } from '../tournament/scope';

/** When sportbet mailed a player's reminder for a game (`reminded_at`). */
export interface RemindedRow {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly at: Instant;
}

/**
 * Restores sportbet's `reminded_at` onto prediction rows the reader just
 * saved (spec 16, decision 11): the moment kept as it was, so a game
 * reminded in its last hours is not reminded again after the switch-over.
 * Each row must be a saved prediction of the tournament's own game and
 * player (TournamentScope); a stray one throws, and nothing is written. The
 * run's own marks are `markReminded`, at the database's clock.
 */
export async function restoreReminded(
  db: Executor,
  tournament: Tournament,
  rows: readonly RemindedRow[],
): Promise<void> {
  const scope = await TournamentScope.read(db, tournament);
  const save = 'restoreReminded';
  const keyed = rows.map(({ player, game, at }) => ({
    player: scope.player(player, save),
    game: scope.game(game, save),
    at: new Date(at).toISOString(),
  }));
  await inChunks(keyed, (chunk) =>
    db.execute(sql`
      update match_predictions as mp
      set reminded_at = restored.at
      from (values ${sql.join(
        chunk.map(
          ({ player, game, at }) =>
            sql`(${player}::integer, ${game}::integer, ${at}::timestamptz)`,
        ),
        sql`, `,
      )}) as restored (player_id, game_id, at)
      where mp.player_id = restored.player_id and mp.game_id = restored.game_id
    `),
  );
}
