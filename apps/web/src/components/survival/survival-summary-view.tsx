import type { JSX } from 'react';
import type { SurvivalSummaryData } from '@sportbet/db';
import { CARD } from '../hub/styles';
import { boardRows, type TileState } from './board-view';
import { SurvivalBoard } from './survival-board';
import { SurvivalTile } from './survival-tile';
import { SV_HEAD, SV_HEAD_NOTE, SV_HEAD_TITLE } from './styles';

const LEGEND: readonly (readonly [TileState, string])[] = [
  ['hit', 'Išliko'],
  ['miss', 'Iškrito'],
  ['pending', 'Pasirinkta, dar nežinoma'],
  ['none', 'Nepasirinkta'],
];

/** .svs-legend: the same tile the board draws, at the same size. */
function Legend() {
  return (
    <div
      data-testid="survival-legend"
      className="mb-3.5 flex flex-wrap gap-x-3.5 gap-y-1.5"
    >
      {LEGEND.map(([state, label]) => (
        <span
          key={state}
          data-testid="survival-legend-item"
          className="inline-flex items-center gap-1.5 text-[0.72rem] text-dim"
        >
          <SurvivalTile tile={{ state }} />
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * sportbet's survival summary (summary/survivals.blade.php): the header,
 * the legend and the board of every listed player's run; with no rounds
 * or no players, "Išlikimo turų šiame turnyre dar nėra.".
 */
export function SurvivalSummaryView({
  data,
}: {
  data: SurvivalSummaryData;
}): JSX.Element {
  const empty =
    data.summary.rounds.length === 0 || data.summary.rows.length === 0;
  return (
    <section className={`${CARD} mb-4`}>
      <div className={SV_HEAD}>
        <h2 className={SV_HEAD_TITLE}>Išlikimas</h2>
        <span className={SV_HEAD_NOTE}>
          Kiekvienas langelis - vieno turo pasirinkimas
        </span>
      </div>
      {empty ? (
        <p className="m-0 text-[0.85rem] text-muted">
          Išlikimo turų šiame turnyre dar nėra.
        </p>
      ) : (
        <>
          <Legend />
          <SurvivalBoard rows={boardRows(data)} />
        </>
      )}
    </section>
  );
}
