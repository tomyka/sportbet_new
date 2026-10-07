import type { PredictionLine, PredictionsPage } from '@sportbet/db';
import { groupPredictionLines } from '@sportbet/domain';
import { dayHeader, vilniusClock, vilniusDate } from '../format/vilnius-time';
import { editorRowOf, scoredLineOf } from './line-text';
import { PredictionEditor } from './prediction-editor';
import { RoundMenu } from './round-menu';
import { ScoredLine } from './scored-line';

/** One row: a finished game, or one still to come or locked. */
function Line({ line }: { line: PredictionLine }) {
  const time = vilniusClock(line.tipOff);
  const { result } = line;
  if (line.state === 'scored' && result !== null) {
    return <ScoredLine line={scoredLineOf({ ...line, result }, time)} />;
  }
  return <PredictionEditor row={editorRowOf(line, time)} />;
}

/**
 * sportbet's predictions page (results.blade.php): the round menu when the
 * tournament has more than one round; each round's name over its Vilnius
 * days, two cards a row from 600px (.pred-event-groups); "Nėra rungtynių."
 * when there is nothing to show - or no tournament (`page` null).
 */
export function PredictionsView({ page }: { page: PredictionsPage | null }) {
  const groups =
    page === null ? [] : groupPredictionLines(page.lines, vilniusDate);
  return (
    <>
      {page !== null && page.rounds.length > 1 ? (
        <div className="mb-2 flex justify-end">
          <RoundMenu rounds={page.rounds} selected={page.selected} />
        </div>
      ) : null}
      {groups.length === 0 ? (
        <p className="py-6 text-center text-muted">Nėra rungtynių.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.round} data-testid="prediction-round">
              <div className="mb-2.5 flex items-center justify-between border-b-2 border-accent pb-1 text-[0.8rem] font-bold tracking-[1px] text-accent uppercase">
                {group.days[0]?.lines[0]?.roundName}
              </div>
              <div className="grid grid-cols-1 gap-2.5 min-[600px]:grid-cols-2">
                {group.days.map((day) => (
                  <div
                    key={day.day}
                    data-testid="prediction-day"
                    className="rounded-[8px] border border-border bg-card px-3 py-2.5"
                  >
                    <div className="mb-[5px] flex items-center justify-between border-b border-border pb-[7px] text-[0.78rem] font-semibold text-muted">
                      {dayHeader(day.day)}
                    </div>
                    {day.lines.map((line) => (
                      <Line key={line.game} line={line} />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
