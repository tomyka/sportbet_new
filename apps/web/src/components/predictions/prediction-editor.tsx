'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TeamCrest } from '../hub/team-crest';
import { Icon } from '../shell/icon';
import { PREDICTION_SAVE_PATH } from '../shell/shell-paths';
import { NOT_SAVED, readSaveAnswer, type SaveOutcome } from './save-answer';

/** An open or locked row, in strings. */
export interface EditorRow {
  readonly game: number;
  readonly time: string;
  readonly home: string;
  readonly away: string;
  readonly predictedHome: string;
  readonly predictedAway: string;
  readonly locked: boolean;
  /** "+X pt" per side, from the votes now; no draw column (Euroleague). */
  readonly panel: { readonly home: string; readonly away: string };
}

/** A box's look (.pred-score and its --saved, --cleared, -error, -locked states). */
type Mark = 'none' | 'saved' | 'cleared' | 'error';

const BOX =
  'w-[42px] rounded-[8px] border bg-surface-2 px-[2px] py-[2px] text-center text-[0.95rem] leading-[1.3] font-bold tabular-nums';

const MARK: Readonly<Record<Mark, string>> = {
  none: 'border-border text-text',
  saved: 'border-ok text-text',
  cleared: 'border-border text-text',
  error: 'border-bad text-text shadow-[0_0_0_2px_var(--color-bad-tint)]',
};

const LOCKED_BOX = 'cursor-not-allowed border-border text-muted';

const TEAM_NAME =
  'max-w-[140px] truncate text-[0.85rem] whitespace-nowrap max-md:portrait:hidden';

/** Posts one pair as sportbet's autosave does (its field names), and reads the answer. */
async function post(
  game: number,
  home: string,
  away: string,
): Promise<SaveOutcome> {
  try {
    const response = await fetch(PREDICTION_SAVE_PATH, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        gameID: String(game),
        prediction_gameID: String(game),
        homeTeamScore: home,
        awayTeamScore: away,
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    return readSaveAnswer(response.status, body);
  } catch {
    return { kind: 'refused', message: NOT_SAVED };
  }
}

/**
 * An unscored game's row (.pred-game) and its odds panel. Open: two boxes
 * that save the pair as it is typed (checkPrediction) - only when both
 * are filled or both are empty, so a half-typed pair is never posted; the
 * server checks it (decision 4) and its message shows under the row; a
 * save turns the boxes green, a clear grey, and refreshes the page's shell
 * so the badge follows (decision 5). Locked: the boxes disabled, the row
 * dimmed. The odds toggle shows once both scores are saved.
 */
export function PredictionEditor({ row }: { row: EditorRow }) {
  const router = useRouter();
  const [home, setHome] = useState(row.predictedHome);
  const [away, setAway] = useState(row.predictedAway);
  const [mark, setMark] = useState<Mark>('none');
  const [message, setMessage] = useState<string | null>(null);
  const [panel, setPanel] = useState(row.panel);
  const [answered, setAnswered] = useState(
    row.predictedHome !== '' && row.predictedAway !== '',
  );
  const [oddsOpen, setOddsOpen] = useState(false);

  const changed = (nextHome: string, nextAway: string) => {
    setHome(nextHome);
    setAway(nextAway);
    setMark('none');
    setMessage(null);
    const pair = [nextHome.trim(), nextAway.trim()] as const;
    const both = pair[0] !== '' && pair[1] !== '';
    const neither = pair[0] === '' && pair[1] === '';
    if (!both && !neither) return;
    void post(row.game, pair[0], pair[1]).then((outcome) => {
      if (outcome.kind === 'refused') {
        setMark('error');
        setMessage(outcome.message);
        return;
      }
      setMark(both ? 'saved' : 'cleared');
      setPanel(outcome.panel);
      setAnswered(both);
      if (!both) setOddsOpen(false);
      router.refresh();
    });
  };

  const box = row.locked ? `${BOX} ${LOCKED_BOX}` : `${BOX} ${MARK[mark]}`;
  return (
    <div data-testid="prediction-row" data-game={row.game}>
      <div
        className={`grid grid-cols-[52px_1fr_auto_1fr_36px] items-center gap-1.5 py-[7px] ${row.locked ? 'opacity-50' : ''}`}
      >
        <span className="text-[0.8rem] leading-none font-semibold tracking-[0.3px] text-muted">
          {row.time}
        </span>
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <TeamCrest team={row.home} size="row" />
          <span className={TEAM_NAME}>{row.home}</span>
        </div>
        <div className="flex items-center gap-[3px] px-2">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            aria-label={row.home}
            disabled={row.locked}
            value={home}
            onChange={(event) => {
              changed(event.target.value, away);
            }}
            className={box}
          />
          <span className="text-[0.95rem] leading-none font-bold text-muted">
            :
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            aria-label={row.away}
            disabled={row.locked}
            value={away}
            onChange={(event) => {
              changed(home, event.target.value);
            }}
            className={box}
          />
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={TEAM_NAME}>{row.away}</span>
          <TeamCrest team={row.away} size="row" />
        </div>
        <span className="flex justify-end">
          {answered ? (
            <button
              type="button"
              aria-label="Koeficientai"
              aria-expanded={oddsOpen}
              onClick={() => {
                setOddsOpen(!oddsOpen);
              }}
              className={`inline-flex cursor-pointer items-center gap-1 rounded-[4px] border-none bg-transparent py-[2px] pr-1.5 pl-[2px] text-[0.85rem] transition-colors hover:text-accent ${oddsOpen ? 'text-accent' : 'text-muted'}`}
            >
              <Icon name="graph-up-arrow" />
            </button>
          ) : null}
        </span>
      </div>
      <div
        role="alert"
        hidden={message === null}
        className="px-1.5 pb-1.5 text-center text-[0.72rem] font-semibold text-bad"
      >
        {message}
      </div>
      <div
        data-testid="odds-panel"
        hidden={!oddsOpen}
        className="mt-1 flex justify-around gap-1 border-t border-border pt-1.5 pb-2"
      >
        <OddsColumn label={row.home} points={panel.home} />
        <OddsColumn label={row.away} points={panel.away} />
      </div>
    </div>
  );
}

/** .pred-odds-col: a side's name and what a right call on it pays now. */
function OddsColumn({ label, points }: { label: string; points: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-[2px] text-center">
      <span className="max-w-[90px] truncate text-[0.68rem] whitespace-nowrap text-muted">
        {label}
      </span>
      <span className="text-[0.8rem] font-bold text-accent">+{points} pt</span>
    </div>
  );
}
