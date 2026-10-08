'use client';

import { SaveMessage, ScoreBox, usePredictionAutosave } from './score-autosave';

/** The single game's score boxes, in strings. */
export interface SingleGameFormText {
  readonly game: number;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly home: string;
  readonly away: string;
}

/**
 * R-62: the single game saves as the list does - the list's two plain
 * score boxes and their autosave (score-autosave.tsx), the same marks and
 * messages, and the player stays on the page. sportbet's page had number
 * boxes and an "Išsaugoti spėjimą" button that went on to /main.
 */
export function SingleGameForm({ form }: { form: SingleGameFormText }) {
  const scores = usePredictionAutosave(form.game, {
    home: form.home,
    away: form.away,
  });
  return (
    <div data-testid="single-game-form">
      <div className="mb-2 flex items-center justify-center gap-[3px]">
        <ScoreBox
          label={form.homeTeam}
          value={scores.home}
          mark={scores.mark}
          onType={scores.typeHome}
          onCommit={scores.commit}
        />
        <span className="text-[0.95rem] leading-none font-bold text-muted">
          :
        </span>
        <ScoreBox
          label={form.awayTeam}
          value={scores.away}
          mark={scores.mark}
          onType={scores.typeAway}
          onCommit={scores.commit}
        />
      </div>
      <SaveMessage message={scores.message} />
    </div>
  );
}
