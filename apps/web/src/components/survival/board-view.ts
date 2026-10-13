import type { SurvivalSummaryData } from '@sportbet/db';
import type { RoundNumber, SummaryTile } from '@sportbet/domain';
import { teamName, wholePoints } from './survival-text';

// The survival summary as the client board draws it: plain strings and
// numbers (a server component cannot hand a Points to a client one), each
// tile's title and each total already written as summary/survivals.blade.php
// writes them.

export type TileState = SummaryTile['state'];

export interface TileView {
  readonly state: TileState;
  /** The team whose crest the tile shows; null for none, and for a pick hidden from this viewer (R-82). */
  readonly crest: string | null;
  readonly title: string;
}

export interface BoardRow {
  readonly player: string;
  readonly rank: number;
  /** The first row's rank is marked (.svs-rank--top). */
  readonly top: boolean;
  readonly username: string;
  readonly initials: string;
  readonly me: boolean;
  readonly tiles: readonly TileView[];
  readonly streak: number;
  /** "N", or R-83's "~N" while a pending pick may still change it. */
  readonly total: string;
}

/** A round's label: its stored name, ":round turas" without one (sportbet's `event ?: ...`). */
const roundLabel = (
  names: ReadonlyMap<RoundNumber, string>,
  round: RoundNumber,
): string => {
  const name = names.get(round);
  return name === undefined || name === '' ? `${String(round)} turas` : name;
};

function tileView(
  tile: SummaryTile,
  data: Pick<SurvivalSummaryData, 'teamNames' | 'roundNames'>,
): TileView {
  const label = roundLabel(data.roundNames, tile.round);
  if (tile.hidden) {
    return {
      state: tile.state,
      crest: null,
      title: `${label} · Pasirinkta · dar nežinoma`,
    };
  }
  if (tile.team === null) {
    return { state: tile.state, crest: null, title: `${label} · nepasirinkta` };
  }
  const name = teamName(data.teamNames, tile.team);
  const outcome =
    tile.points === null ? 'dar nežinoma' : String(wholePoints(tile.points));
  return {
    state: tile.state,
    crest: name,
    title: `${label} · ${name} · ${outcome}`,
  };
}

/** Every listed player's row, in the summary's order. */
export function boardRows(data: SurvivalSummaryData): readonly BoardRow[] {
  return data.summary.rows.map((row) => {
    const total = String(wholePoints(row.total));
    return {
      player: row.player,
      rank: row.rank,
      top: row.rank === 1,
      username: row.username,
      initials: row.initials,
      me: row.me,
      tiles: row.tiles.map((tile) => tileView(tile, data)),
      streak: row.streak,
      total: row.provisional ? `~${total}` : total,
    };
  });
}
