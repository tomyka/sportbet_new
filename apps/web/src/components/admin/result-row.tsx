'use client';

import type { ResultsPageGame } from '@sportbet/db';
import { useRef, useState } from 'react';
import { dayHeader, vilniusClock, vilniusDate } from '../format/vilnius-time';
import { TeamCrest } from '../hub/team-crest';
import {
  SaveMessage,
  ScoreBox,
  type Mark,
} from '../predictions/score-autosave';
import { UPDATE_RESULT_PATH } from '../shell/shell-paths';
import {
  readResultAnswer,
  RESULT_NOT_SAVED,
  resultRequestBody,
  type ResultOutcome,
} from './result-protocol';

const TEAM_NAME =
  'max-w-[140px] truncate text-[0.85rem] whitespace-nowrap max-md:portrait:hidden';

/** The boxes' values: a result's sides, a postponed game's -1 : -1 (R-63), or empty. */
export function boxesOf(game: ResultsPageGame): { home: string; away: string } {
  if (game.result !== null) {
    return { home: String(game.result.home), away: String(game.result.away) };
  }
  return game.postponed ? { home: '-1', away: '-1' } : { home: '', away: '' };
}

/** Posts one game's boxes as sportbet's page does, and reads the answer; a lost connection is "Neišsaugota". */
async function postResult(
  game: number,
  home: string,
  away: string,
): Promise<ResultOutcome> {
  try {
    const response = await fetch(UPDATE_RESULT_PATH, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: resultRequestBody({ game, home, away }),
    });
    const body: unknown = await response.json().catch(() => null);
    return readResultAnswer(response.status, body, RESULT_NOT_SAVED);
  } catch {
    return { kind: 'refused', message: RESULT_NOT_SAVED };
  }
}

/**
 * .admin-result-row and results.blade.php's saveResult: one game's boxes,
 * saved on change - when a box is left or Enter pressed, never per
 * keystroke, since each result runs fill-ins and a whole recalculation.
 * A pair is posted only when both boxes are filled or both empty and it
 * differs from the pair last sent; one box alone is marked yellow
 * ("partial") and not sent. A save marks them green, a clear grey, a
 * refusal red with the server's message (design decision 11; sportbet's
 * page shows only the red). -1 : -1 saved is "Atidėta" (R-63).
 */
export function ResultRow({ game }: { game: ResultsPageGame }) {
  const initial = boxesOf(game);
  const [home, setHome] = useState(initial.home);
  const [away, setAway] = useState(initial.away);
  const [mark, setMark] = useState<Mark>(
    game.result !== null ? 'saved' : 'none',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [postponed, setPostponed] = useState(game.postponed);
  const sent = useRef(`${initial.home}:${initial.away}`);
  const label = `${game.home} - ${game.away}`;

  const commit = () => {
    const pair = [home.trim(), away.trim()] as const;
    const both = pair[0] !== '' && pair[1] !== '';
    const neither = pair[0] === '' && pair[1] === '';
    if (!both && !neither) {
      setMark('partial');
      return;
    }
    const key = `${pair[0]}:${pair[1]}`;
    if (key === sent.current) return;
    sent.current = key;
    setMessage(null);
    void postResult(game.game, pair[0], pair[1]).then((outcome) => {
      if (outcome.kind === 'refused') {
        sent.current = '';
        setMark('error');
        setMessage(outcome.message);
        return;
      }
      setMark(both ? 'saved' : 'cleared');
      setPostponed(pair[0] === '-1' && pair[1] === '-1');
    });
  };

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
          <ScoreBox
            label={`${label}: namų komanda`}
            value={home}
            mark={mark}
            locked={!game.open}
            onType={setHome}
            onCommit={commit}
          />
          <span className="text-[0.95rem] leading-none font-bold text-muted">
            :
          </span>
          <ScoreBox
            label={`${label}: svečių komanda`}
            value={away}
            mark={mark}
            locked={!game.open}
            onType={setAway}
            onCommit={commit}
          />
        </div>
        {postponed ? (
          <span className="text-[0.72rem] font-semibold text-warn">
            Atidėta
          </span>
        ) : null}
        <SaveMessage message={message} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={TEAM_NAME}>{game.away}</span>
        <TeamCrest team={game.away} size="row" />
      </div>
    </div>
  );
}
