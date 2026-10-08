'use client';

import { useState } from 'react';
import { TeamCrest } from '../hub/team-crest';
import { Icon } from '../shell/icon';
import { SaveMessage, ScoreBox, usePredictionAutosave } from './score-autosave';

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

const TEAM_NAME =
  'max-w-[140px] truncate text-[0.85rem] whitespace-nowrap max-md:portrait:hidden';

/**
 * An unscored game's row (.pred-game) and its odds panel. Open: the two
 * score boxes and their autosave (score-autosave.tsx), the refusal's
 * message under the row. Locked: the boxes disabled, the row dimmed. The
 * odds toggle shows once both scores are saved, and a save brings the
 * panel's points as the votes stand now.
 */
export function PredictionEditor({ row }: { row: EditorRow }) {
  const [panel, setPanel] = useState(row.panel);
  const [answered, setAnswered] = useState(
    row.predictedHome !== '' && row.predictedAway !== '',
  );
  const [oddsOpen, setOddsOpen] = useState(false);
  const scores = usePredictionAutosave(
    row.game,
    { home: row.predictedHome, away: row.predictedAway },
    (saved) => {
      setPanel(saved.panel);
      setAnswered(saved.scored);
      if (!saved.scored) setOddsOpen(false);
    },
  );

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
          <ScoreBox
            label={row.home}
            value={scores.home}
            mark={scores.mark}
            locked={row.locked}
            onType={scores.typeHome}
            onCommit={scores.commit}
          />
          <span className="text-[0.95rem] leading-none font-bold text-muted">
            :
          </span>
          <ScoreBox
            label={row.away}
            value={scores.away}
            mark={scores.mark}
            locked={row.locked}
            onType={scores.typeAway}
            onCommit={scores.commit}
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
      <SaveMessage message={scores.message} />
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
