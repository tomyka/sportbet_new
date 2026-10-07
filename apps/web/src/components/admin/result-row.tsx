import type { ResultsPageGame } from '@sportbet/db';
import { dayHeader, vilniusClock, vilniusDate } from '../format/vilnius-time';
import { TeamCrest } from '../hub/team-crest';

/** .pred-score.pred-score-wide: three digits, as sportbet's results page fixes them (issue 184). */
const BOX =
  'w-[42px] rounded-[8px] border bg-surface-2 px-[2px] py-[2px] text-center text-[0.95rem] leading-[1.3] font-bold tabular-nums text-text disabled:cursor-not-allowed disabled:text-muted';

const TEAM_NAME =
  'max-w-[140px] truncate text-[0.85rem] whitespace-nowrap max-md:portrait:hidden';

/** The boxes' values: a result's sides, a postponed game's -1 : -1 (R-63), or empty. */
export function boxesOf(game: ResultsPageGame): { home: string; away: string } {
  if (game.result !== null) {
    return { home: String(game.result.home), away: String(game.result.away) };
  }
  return game.postponed ? { home: '-1', away: '-1' } : { home: '', away: '' };
}

/**
 * .admin-result-row (admin/results.blade.php): the home team, the day and
 * time in Vilnius over two boxes (.pred-scores), the away team; a scored
 * game's boxes green, a future game's disabled, a postponed game's
 * -1 : -1 and "Atidėta". Read-only until the results autosave (Task 10).
 */
export function ResultRow({ game }: { game: ResultsPageGame }) {
  const boxes = boxesOf(game);
  const label = `${game.home} - ${game.away}`;
  const mark = game.result !== null ? 'border-ok' : 'border-border';
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-[7px] [&+&]:border-t [&+&]:border-border">
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <TeamCrest team={game.home} size="row" />
        <span className={TEAM_NAME}>{game.home}</span>
      </div>
      <div className="flex flex-col items-center gap-[2px] px-2">
        <span className="text-[0.8rem] leading-none font-semibold tracking-[0.3px] text-muted">
          {`${dayHeader(vilniusDate(game.tipOff))} · ${vilniusClock(game.tipOff)}`}
        </span>
        <div className="flex items-center gap-[3px]">
          <input
            type="text"
            readOnly
            maxLength={3}
            autoComplete="off"
            aria-label={`${label}: namų komanda`}
            disabled={!game.open}
            value={boxes.home}
            className={`${BOX} ${mark}`}
          />
          <span className="text-[0.95rem] leading-none font-bold text-muted">
            :
          </span>
          <input
            type="text"
            readOnly
            maxLength={3}
            autoComplete="off"
            aria-label={`${label}: svečių komanda`}
            disabled={!game.open}
            value={boxes.away}
            className={`${BOX} ${mark}`}
          />
        </div>
        {game.postponed ? (
          <span className="text-[0.72rem] font-semibold text-warn">
            Atidėta
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={TEAM_NAME}>{game.away}</span>
        <TeamCrest team={game.away} size="row" />
      </div>
    </div>
  );
}
