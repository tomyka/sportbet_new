import type { ChartColourRow } from '@sportbet/db/account';
import { playerOf } from '@sportbet/db/edge';
import { sportbetColumns } from '@sportbet/domain';
import type { Ledger, MapContext } from './ledger';

// sportbet's `colors`: a player's chart colour, the row whose id is the
// player's id (R-136). Only `id` and `color_code` are read, and the colour is
// loaded onto the player alone.

/**
 * colors: each loaded player's colour, as `#rrggbb`. A row is counted, never
 * shown: sportbet seeds about 125 colours for ids that may be no user (`no-
 * such-player`) or a user that did not load (`player-not-loaded`), and
 * draws an empty code in the palette, as a line without a row is (`empty`),
 * so all three are skipped by design. A code that is not `#rrggbb` once
 * trimmed and lower-cased is refused as `invalid-colour`: the line keeps its
 * position's palette colour, and the report counts it by that reason.
 */
export function mapColours(
  ctx: MapContext,
  known: ReadonlySet<number>,
  loadedUsers: ReadonlySet<number>,
): ChartColourRow[] {
  const { ledger } = ctx;
  const colours: ChartColourRow[] = [];
  for (const row of ctx.rows.colors) {
    const colour = colourOf(ledger, row, known, loadedUsers);
    if (colour !== null) colours.push(colour);
  }
  return colours;
}

function colourOf(
  ledger: Ledger,
  row: MapContext['rows']['colors'][number],
  known: ReadonlySet<number>,
  loadedUsers: ReadonlySet<number>,
): ChartColourRow | null {
  if (!known.has(row.id)) {
    ledger.skip('colors', 'no-such-player');
    return null;
  }
  if (!loadedUsers.has(row.id)) {
    ledger.skip('colors', 'player-not-loaded');
    return null;
  }
  if (row.color_code === '') {
    ledger.skip('colors', 'empty');
    return null;
  }
  const colour = sportbetColumns.chartColour(row.color_code);
  if (!colour.ok) {
    ledger.refuse('colors', 'invalid-colour');
    return null;
  }
  ledger.load('colors');
  return { player: playerOf(row.id), colour: colour.value };
}
