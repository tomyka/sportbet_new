import type { GameId } from '@sportbet/domain';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { gameOf } from '../edge';
import type { RealPredictionScope } from '../season/real-predictions';

const countRows = z.array(z.object({ game: z.int(), picks: z.int() }));

function filterOf(scope: RealPredictionScope): SQL {
  return 'game' in scope
    ? sql`g.id = ${scope.game}`
    : sql`g.tournament_id = ${scope.tournament}`;
}

/**
 * How many survival picks name one of each game's two teams in the game's
 * round (R-125) - the one reading of "a pick depends on this game", for
 * the writer that decides on it and the page that offers the choice. A game
 * nobody picked on is not listed. Under the game row's FOR UPDATE lock the
 * count is final until commit: a survival save takes the round's game rows
 * FOR SHARE first.
 */
export async function survivalPickCounts(
  db: Executor,
  scope: RealPredictionScope,
): Promise<Map<GameId, number>> {
  const result = await db.execute(sql`
    select g.id as game, count(*)::int as picks
    from games g
    join survival_picks p
      on p.round_id = g.round_id
      and p.team_id in (g.home_team_id, g.away_team_id)
    where ${filterOf(scope)}
    group by g.id
  `);
  return new Map(
    countRows.parse(result.rows).map((row) => [gameOf(row.game), row.picks]),
  );
}
