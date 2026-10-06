'use client';

import { useState } from 'react';
import { BUTTON_PRIMARY } from '../hub/styles';
import { Icon } from '../shell/icon';
import { PLAYER_HOME } from '../shell/shell-paths';
import { postPrediction } from './save-answer';

/** The single game's form, in strings. */
export interface SingleGameFormText {
  readonly game: number;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly home: string;
  readonly away: string;
  /** The score boxes' bounds (ScoreFormat's min and inputMax). */
  readonly min: number;
  readonly max: number;
}

const BOX =
  'w-20 rounded-[8px] border bg-card px-2 py-1.5 text-center text-[1.25rem] font-bold text-text';

const goTo = (path: string): void => {
  window.location.assign(path);
};

/**
 * game-single.blade.php's form: the two boxes, "Išsaugoti spėjimą"; a save
 * goes to the player's home (sportbet's /main, PLAYER_HOME until slice 8);
 * a refusal shows the server's message under the boxes (R-59), the button
 * usable again. The server checks the pair (decision 4).
 */
export function SingleGameForm({
  form,
  go = goTo,
}: {
  form: SingleGameFormText;
  go?: (path: string) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = `${BOX} ${message === null ? 'border-border' : 'border-bad shadow-[0_0_0_2px_var(--color-bad-tint)]'}`;
  return (
    <form
      data-testid="single-game-form"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const text = (name: string) => {
          const value = fields.get(name);
          return typeof value === 'string' ? value.trim() : '';
        };
        setBusy(true);
        void postPrediction(
          form.game,
          text('homeTeamScore'),
          text('awayTeamScore'),
        ).then((outcome) => {
          if (outcome.kind === 'saved') {
            go(PLAYER_HOME);
            return;
          }
          setMessage(outcome.message);
          setBusy(false);
        });
      }}
    >
      <div className="mb-6 flex items-center justify-center gap-4">
        <input
          type="number"
          name="homeTeamScore"
          aria-label={form.homeTeam}
          min={form.min}
          max={form.max}
          defaultValue={form.home}
          placeholder="?"
          className={box}
        />
        <span className="text-[1.5rem] font-bold text-muted">:</span>
        <input
          type="number"
          name="awayTeamScore"
          aria-label={form.awayTeam}
          min={form.min}
          max={form.max}
          defaultValue={form.away}
          placeholder="?"
          className={box}
        />
      </div>
      <div
        role="alert"
        hidden={message === null}
        className="px-1.5 pb-1.5 text-center text-[0.72rem] font-semibold text-bad"
      >
        {message}
      </div>
      <div className="text-center">
        <button
          type="submit"
          disabled={busy}
          className={`${BUTTON_PRIMARY} disabled:opacity-60`}
        >
          <Icon name="check2" /> Išsaugoti spėjimą
        </button>
      </div>
    </form>
  );
}
