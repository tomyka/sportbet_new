'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { postPrediction } from './save-answer';

/** A box's look (.pred-score and its --saved, --partial, --cleared, -error, -locked states). */
export type Mark = 'none' | 'saved' | 'partial' | 'cleared' | 'error';

const BOX =
  'w-[42px] rounded-[8px] border bg-surface-2 px-[2px] py-[2px] text-center text-[0.95rem] leading-[1.3] font-bold tabular-nums';

const MARK: Readonly<Record<Mark, string>> = {
  none: 'border-border text-text',
  saved: 'border-ok text-text',
  partial: 'border-warn text-text',
  cleared: 'border-border text-text',
  error: 'border-bad text-text shadow-[0_0_0_2px_var(--color-bad-tint)]',
};

const LOCKED_BOX = 'cursor-not-allowed border-border text-muted';

/**
 * How long the autosave waits after the last keystroke before it posts, so
 * a number typed digit by digit ("8", then "85") is sent once, whole.
 * Leaving the box, or Enter, posts at once.
 */
export const SAVE_DELAY_MS = 400;

/** What a save that went through answers: the odds panel now, and whether the pair was a score (else a clear). */
export interface AutosaveSaved {
  readonly panel: { readonly home: string; readonly away: string };
  readonly scored: boolean;
}

/**
 * One game's two score boxes and their autosave (results.blade.php's
 * checkPrediction), as the list and the single game page (R-62) both use
 * them: the pair is posted only when both boxes are filled or both are
 * empty, so a half-typed pair never is, and only once typing pauses
 * (SAVE_DELAY_MS) or the box is left (`commit`); an answer to an older post
 * than the latest is ignored, so a slow refusal of a half-typed number can
 * never land over a later save, and a save clears any message; the server checks it (decision 4)
 * and a refusal's own message shows (R-59, the 429). A save marks the
 * boxes green, a clear grey, and refreshes the page's shell so the badge
 * follows (decision 5); the player stays where they are.
 */
export function usePredictionAutosave(
  game: number,
  initial: { readonly home: string; readonly away: string },
  onSaved?: (saved: AutosaveSaved) => void,
) {
  const router = useRouter();
  const [home, setHome] = useState(initial.home);
  const [away, setAway] = useState(initial.away);
  const [mark, setMark] = useState<Mark>('none');
  const [message, setMessage] = useState<string | null>(null);

  // The pair waiting for typing to pause, and the latest post's number.
  const pending = useRef<{
    readonly timer: ReturnType<typeof setTimeout>;
    readonly pair: readonly [string, string];
  } | null>(null);
  const latest = useRef(0);

  const post = (pair: readonly [string, string]) => {
    latest.current += 1;
    const sent = latest.current;
    const scored = pair[0] !== '';
    void postPrediction(game, pair[0], pair[1]).then((outcome) => {
      if (sent !== latest.current) return;
      if (outcome.kind === 'refused') {
        setMark('error');
        setMessage(outcome.message);
        return;
      }
      setMark(scored ? 'saved' : 'cleared');
      setMessage(null);
      onSaved?.({ panel: outcome.panel, scored });
      router.refresh();
    });
  };

  /** Posts the waiting pair now, if there is one. */
  const commit = () => {
    const waiting = pending.current;
    if (waiting === null) return;
    clearTimeout(waiting.timer);
    pending.current = null;
    post(waiting.pair);
  };

  // A pair still waiting when the boxes go (the page left) is posted.
  const commitOnUnmount = useRef(commit);
  commitOnUnmount.current = commit;
  useEffect(
    () => () => {
      commitOnUnmount.current();
    },
    [],
  );

  const changed = (nextHome: string, nextAway: string) => {
    setHome(nextHome);
    setAway(nextAway);
    setMark('none');
    setMessage(null);
    // Typing again makes any answer still on its way out of date.
    latest.current += 1;
    if (pending.current !== null) clearTimeout(pending.current.timer);
    pending.current = null;
    const pair = [nextHome.trim(), nextAway.trim()] as const;
    const both = pair[0] !== '' && pair[1] !== '';
    const neither = pair[0] === '' && pair[1] === '';
    if (!both && !neither) return;
    pending.current = { pair, timer: setTimeout(commit, SAVE_DELAY_MS) };
  };

  return {
    home,
    away,
    mark,
    message,
    commit,
    typeHome: (value: string) => {
      changed(value, away);
    },
    typeAway: (value: string) => {
      changed(home, value);
    },
  };
}

/**
 * .pred-score: a plain text box for a score (inputmode numeric, no arrows),
 * marked by its last save. `onCommit` is a change committed - the box left,
 * or Enter - for a page that saves then rather than as it is typed.
 */
export function ScoreBox({
  label,
  value,
  mark,
  locked = false,
  onType,
  onCommit,
}: {
  label: string;
  value: string;
  mark: Mark;
  locked?: boolean;
  onType: (value: string) => void;
  onCommit?: () => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={3}
      aria-label={label}
      disabled={locked}
      value={value}
      onChange={(event) => {
        onType(event.target.value);
      }}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit?.();
      }}
      className={`${BOX} ${locked ? LOCKED_BOX : MARK[mark]}`}
    />
  );
}

/** .pred-score-msg: the save's refusal under the boxes, hidden while there is none. */
export function SaveMessage({ message }: { message: string | null }) {
  return (
    <div
      role="alert"
      hidden={message === null}
      className="px-1.5 pb-1.5 text-center text-[0.72rem] font-semibold text-bad"
    >
      {message}
    </div>
  );
}
