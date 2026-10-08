import type { StandingsCloses, StandingsPage } from '@sportbet/domain';
import { vilniusDateTime } from '../format/vilnius-time';
import { Ladder } from './ladder';

/** R-80: when the predictions close, in Vilnius time (R-51); nothing for a tournament with no deadline game. */
function ClosesLine({ closes }: { closes: StandingsCloses }) {
  if (closes.state === 'never') return null;
  return (
    <p className="mb-3 text-[0.85rem] font-semibold text-muted">
      {closes.state === 'open'
        ? `Prognozės užsidaro ${vilniusDateTime(closes.at)}.`
        : 'Prognozės uždarytos.'}
    </p>
  );
}

/** .ps-legend, for the Euroleague's format: its whole-table places, two stages and two final places. */
function Legend() {
  return (
    <div
      data-testid="standings-legend"
      className="mt-3 max-w-[480px] text-[0.78rem] text-muted"
    >
      <p className="mb-0.5">
        <strong>Vieta</strong> - tempkite eilutes arba naudokite rodykles; vieta
        lentelėje yra eilės numeris.
      </p>
      <p className="mb-0.5">
        <strong>1/4 - 1/2</strong> - pažymėkite komandas, patenkančias į
        kiekvieną etapą.
      </p>
      <p className="mb-0.5">
        <strong>F</strong> - 1 - čempionas, 2 - vicečempionas.
      </p>
    </div>
  );
}

/**
 * sportbet's standings page (prediction/standings.blade.php): when the
 * predictions close (R-80), the ladder's card, its legend, and the
 * counters.
 */
export function StandingsView({ page }: { page: StandingsPage }) {
  return (
    <>
      <ClosesLine closes={page.closes} />
      <Ladder page={page}>
        <Legend />
      </Ladder>
    </>
  );
}
