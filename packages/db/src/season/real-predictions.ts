import type { GameId } from '@sportbet/domain';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { gameOf } from '../edge';

const countRows = z.array(z.object({ game: z.int(), players: z.int() }));

/**
 * The games to count the real predictions of: one tournament's, or one
 * game.
 */
export type RealPredictionScope =
  { readonly tournament: number } | { readonly game: GameId };

function filterOf(scope: RealPredictionScope): SQL {
  return 'game' in scope
    ? sql`g.id = ${scope.game}`
    : sql`g.tournament_id = ${scope.tournament}`;
}

/**
 * How many players have a real prediction on each game of the scope (R-89,
 * R-90) - the one reading of "a real prediction exists", for the writers
 * that decide on it and the page that offers the choice: a scored row of
 * origin `real` (a blank row and a fill-in are none), or an audit row - a
 * score was saved once (the audit row's key is `restrict`), even if the row
 * was cleared again. A game nobody predicted is not listed. Under the game
 * row's FOR UPDATE lock the count is final until commit: a prediction save
 * takes the row FOR SHARE first.
 */
export async function realPredictionCounts(
  db: Executor,
  scope: RealPredictionScope,
): Promise<Map<GameId, number>> {
  const result = await db.execute(sql`
    select p.game_id as game, count(*)::int as players
    from (
      select game_id, player_id from match_predictions
        where origin = 'real' and home is not null and away is not null
      union
      select game_id, player_id from audit_prediction_games
    ) p
    join games g on g.id = p.game_id
    where ${filterOf(scope)}
    group by p.game_id
  `);
  return new Map(
    countRows.parse(result.rows).map((row) => [gameOf(row.game), row.players]),
  );
}
