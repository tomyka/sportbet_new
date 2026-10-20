import {
  chartColour,
  chartColourInvariant,
  type ChartColour,
  type PlayerId,
} from '@sportbet/domain';
import { and, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, playerOf, stored } from '../edge';
import { players } from './schema';

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
