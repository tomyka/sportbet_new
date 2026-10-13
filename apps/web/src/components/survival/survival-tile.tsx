import type { JSX } from 'react';
import { TeamCrest } from '../hub/team-crest';
import type { TileState, TileView } from './board-view';

// A round's outcome lives in the tile's border and nowhere else
// (custom.css, "Survival summary"): nothing fades a tile's crest but a
// miss's scrim, laid over it.
const STATES: Readonly<Record<TileState, string>> = {
  hit: 'border-solid border-ok bg-crest-plate',
  miss: "border-solid border-bad bg-crest-plate after:absolute after:inset-0 after:rounded-[2px] after:shadow-[inset_0_0_0_40px_var(--color-scrim)] after:content-['']",
  pending: 'border-dashed border-accent bg-crest-plate',
  none: 'border-dashed border-border bg-transparent opacity-50',
};

const BASE =
  'relative box-border block size-[35px] flex-none overflow-hidden rounded-[3px] border-[1.5px]';

/** .svs-tile: the board's tiles and the legend's, one markup at one size. */
export function SurvivalTile({
  tile,
  testId,
}: {
  tile: Pick<TileView, 'state'> & Partial<Pick<TileView, 'crest' | 'title'>>;
  testId?: string;
}): JSX.Element {
  return (
    <span
      data-testid={testId}
      data-state={tile.state}
      title={tile.title}
      aria-hidden={tile.title === undefined ? true : undefined}
      className={`${BASE} ${STATES[tile.state]}`}
    >
      {tile.crest === null || tile.crest === undefined ? null : (
        <TeamCrest team={tile.crest} size="tile" />
      )}
    </span>
  );
}
