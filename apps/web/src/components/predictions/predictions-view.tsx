import type { PredictionLine, PredictionsPage } from '@sportbet/db';
import { groupPredictionLines, onePlace } from '@sportbet/domain';
import { dayHeader, vilniusClock, vilniusDate } from '../format/vilnius-time';
import { PredictionEditor } from './prediction-editor';
import { RoundMenu } from './round-menu';
import { ScoredLine } from './scored-line';

const side = (score: number | null): string =>
  score === null ? '' : String(score);

/**
 * A scored row's points as strings: full + serija for the total
 * (results.blade.php's $totalPts). A row that earned nothing is drawn as
 * sportbet draws it (upt-empty: "0.0", faint, no breakdown), so null.
 */
function pointsText(line: PredictionLine) {
  const { points } = line;
  if (points === null) return null;
  const total = points.full.hundredths + points.serija.hundredths;
  if (total <= 0) return null;
  return {
    total: onePlace(total),
    winner: onePlace(points.winner.hundredths),
    margin: onePlace(points.margin.hundredths),
    bingo: onePlace(points.bingo.hundredths),
    serija: points.serija.isPositive()
      ? onePlace(points.serija.hundredths)
      : null,
  };
}

/** One row: a finished game, or one still to come or locked. */
function Line({ line }: { line: PredictionLine }) {
  const time = vilniusClock(line.tipOff);
  if (line.state === 'scored' && line.result !== null) {
    return (
      <ScoredLine
        line={{
          game: line.game,
          time,
          home: line.home,
          away: line.away,
          result: `${String(line.result.home)}:${String(line.result.away)}`,
          predicted: `${line.predicted.home === null ? '?' : String(line.predicted.home)}:${line.predicted.away === null ? '?' : String(line.predicted.away)}`,
          points: pointsText(line),
        }}
      />
    );
  }
  const panel = line.panel;
  return (
    <PredictionEditor
      row={{
        game: line.game,
        time,
        home: line.home,
        away: line.away,
        predictedHome: side(line.predicted.home),
        predictedAway: side(line.predicted.away),
        locked: line.state === 'locked',
        panel: {
          home: panel === null ? '0.0' : onePlace(panel.home.hundredths),
          away: panel === null ? '0.0' : onePlace(panel.away.hundredths),
        },
      }}
    />
  );
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
