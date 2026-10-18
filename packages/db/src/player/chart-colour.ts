import {
  chartColour,
  chartColourInvariant,
  type ChartColour,
  type PlayerId,
} from '@sportbet/domain';
import { and, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { inChunks, keyOf, playerOf, stored } from '../edge';
import { players } from './schema';

/** A player's chart colour, from sportbet's `colors.color_code` (R-136). */
export interface ChartColourRow {
  readonly player: PlayerId;
  readonly colour: ChartColour;
}

/**
 * Restores sportbet's `colors.color_code` onto the players the reader just
 * saved (R-136). Nothing else writes the column: no page sets a colour, as in
 * sportbet. Rows naming a player that is not saved change nothing.
 */
export async function restoreChartColours(
  db: Executor,
  rows: readonly ChartColourRow[],
): Promise<void> {
  const keyed = rows.map(({ player, colour }) => ({
    player: keyOf(player, 'player'),
    colour,
  }));
  await inChunks(keyed, (chunk) =>
    db.execute(sql`
      update players as p
      set chart_colour = restored.colour
      from (values ${sql.join(
        chunk.map(({ player, colour }) => sql`(${player}::integer, ${colour})`),
        sql`, `,
      )}) as restored (player_id, colour)
      where p.id = restored.player_id
    `),
  );
}

const colourRows = z.array(
  z.object({ id: z.int(), colour: chartColourInvariant.schema }),
);

/**
 * The chart colours of those of `ids` who have one (R-136), by player; a
 * player without one is absent and their line takes its position's colour.
 */
export async function loadChartColours(
  db: Executor,
  ids: readonly PlayerId[],
): Promise<Map<PlayerId, ChartColour>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: players.id, colour: players.chartColour })
    .from(players)
    .where(
      and(
        isNotNull(players.chartColour),
        inArray(
          players.id,
          ids.map((id) => keyOf(id, 'player')),
        ),
      ),
    );
  return new Map(
    colourRows
      .parse(rows)
      .map(({ id, colour }) => [
        playerOf(id),
        stored(chartColour(colour), 'players', id),
      ]),
  );
}
