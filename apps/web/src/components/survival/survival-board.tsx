'use client';

import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SCROLL_ARROW } from '../hub/styles';
import { Icon } from '../shell/icon';
import type { BoardRow } from './board-view';
import { SurvivalTile } from './survival-tile';

interface Edges {
  readonly overflows: boolean;
  readonly atStart: boolean;
  readonly atEnd: boolean;
}

const FITS: Edges = { overflows: false, atStart: true, atEnd: true };

const STAT_N =
  'block text-[1.15rem] leading-[1.1] font-extrabold tabular-nums max-[480px]:text-[1rem]';
const STAT_L = 'block text-[0.58rem] tracking-[0.1em] text-muted uppercase';

const runsIn = (board: HTMLElement | null): HTMLElement[] =>
  Array.from(board?.querySelectorAll<HTMLElement>('[data-run]') ?? []);

const maxLeft = (run: HTMLElement): number => run.scrollWidth - run.clientWidth;

/** Where the lead run sits; a couple of pixels of slack, as scrollLeft is fractional on a trackpad. */
function edgesOf(lead: HTMLElement | undefined): Edges {
  if (lead === undefined) return FITS;
  const max = maxLeft(lead);
  return {
    overflows: max > 4,
    atStart: lead.scrollLeft <= 2,
    atEnd: lead.scrollLeft >= max - 2,
  };
}

/**
 * Every run but `except` to `left`, skipping those already there (so an
 * arrow's smooth scroll is not cut short). A scrollLeft written here fires
 * 'scroll' like a player's, so `syncing` is held for a frame to keep the
 * moved runs from mirroring back.
 */
function scrollRuns(
  runs: readonly HTMLElement[],
  move: { readonly left: number; readonly behavior: ScrollBehavior },
  syncing: { current: boolean },
  except?: HTMLElement,
): void {
  syncing.current = true;
  for (const run of runs) {
    if (run !== except && Math.abs(run.scrollLeft - move.left) > 1) {
      run.scrollTo(move);
    }
  }
  requestAnimationFrame(() => {
    syncing.current = false;
  });
}

/**
 * survivalRuns(): every run holds one tile per round and they all share
 * one scrollLeft, so round n stays in one column on every row; a run's
 * live end is its right-hand one, so the board starts there, and only a
 * board still at its right edge is pinned there again on a resize.
 */
function useSharedScroll() {
  const board = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [edges, setEdges] = useState<Edges>(FITS);
  const atEnd = useRef(true);

  const measure = useCallback(() => {
    const next = edgesOf(runsIn(board.current)[0]);
    atEnd.current = next.atEnd;
    setEdges(next);
  }, []);

  const anchorRight = useCallback(() => {
    const runs = runsIn(board.current);
    const lead = runs[0];
    if (lead === undefined) return;
    scrollRuns(runs, { left: maxLeft(lead), behavior: 'instant' }, syncing);
    measure();
  }, [measure]);

  useEffect(() => {
    anchorRight();
    const onResize = () => {
      if (atEnd.current) anchorRight();
      else measure();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('load', anchorRight);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('load', anchorRight);
    };
  }, [anchorRight, measure]);

  const sync = (source: HTMLElement) => {
    if (syncing.current) return;
    const move = { left: source.scrollLeft, behavior: 'instant' } as const;
    scrollRuns(runsIn(board.current), move, syncing, source);
    measure();
  };

  /** Most of a screenful, never less than a handful of rounds; the CSS decides how smoothly. */
  const nudge = (direction: -1 | 1) => {
    const runs = runsIn(board.current);
    const lead = runs[0];
    if (lead === undefined) return;
    const step = Math.max(lead.clientWidth * 0.8, 112);
    const left = Math.min(
      Math.max(lead.scrollLeft + direction * step, 0),
      maxLeft(lead),
    );
    scrollRuns(runs, { left, behavior: 'auto' }, syncing);
    measure();
  };

  return { board, edges, sync, nudge };
}

/** One player's row (.svs-row): rank, initials and name, the run, "Iš eilės" and "taškų". */
function Row({
  row,
  onScroll,
}: {
  row: BoardRow;
  onScroll: (run: HTMLElement) => void;
}) {
  return (
    <li
      data-testid="survival-row"
      data-me={row.me}
      className={`grid grid-cols-[26px_minmax(0,11rem)_minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-md border px-3 py-2.5 max-[480px]:grid-cols-[22px_minmax(0,5rem)_minmax(0,1fr)_auto_auto] max-[480px]:gap-x-2 max-[480px]:p-2.5 ${row.me ? 'border-accent bg-accent-tint' : 'border-border bg-surface-2'}`}
    >
      <span
        data-testid="survival-rank"
        data-top={row.top}
        className={`text-center text-[0.8rem] font-bold tabular-nums ${row.top ? 'text-accent' : 'text-dim'}`}
      >
        {row.rank}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span
          data-testid="survival-avatar"
          aria-hidden="true"
          className="grid size-[22px] flex-none place-items-center rounded-full bg-accent text-[0.62rem] font-extrabold text-on-accent max-[480px]:hidden"
        >
          {row.initials}
        </span>
        <span className="max-w-[9rem] truncate text-[0.85rem] font-semibold text-text max-[480px]:max-w-[5rem]">
          {row.username}
        </span>
      </span>
      <span
        data-run=""
        data-testid="survival-run"
        onScroll={(event) => {
          onScroll(event.currentTarget);
        }}
        className="flex min-w-0 [scrollbar-width:none] gap-[3px] overflow-x-auto scroll-smooth motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
      >
        {row.tiles.map((tile, index) => (
          <SurvivalTile
            // One tile per round, in round order: the index is the round's place.
            key={index}
            tile={tile}
            testId="survival-tile"
          />
        ))}
      </span>
      <span data-testid="survival-streak" className="text-right">
        <span className={`${STAT_N} text-text`}>{row.streak}</span>
        <span className={STAT_L}>Iš eilės</span>
      </span>
      <span data-testid="survival-total" className="text-right">
        <span className={`${STAT_N} text-accent`}>{row.total}</span>
        <span className={STAT_L}>taškų</span>
      </span>
    </li>
  );
}

/** summary/survivals.blade.php's .svs-board: one row per player, one pair of arrows for every run. */
export function SurvivalBoard({
  rows,
}: {
  rows: readonly BoardRow[];
}): JSX.Element {
  const { board, edges, sync, nudge } = useSharedScroll();
  return (
    <div ref={board} className="relative">
      {edges.overflows && !edges.atStart ? (
        <button
          type="button"
          aria-label="Ankstesni turai"
          className={`${SCROLL_ARROW} -left-2.5`}
          onClick={() => {
            nudge(-1);
          }}
        >
          <Icon name="chevron-left" />
        </button>
      ) : null}
      <ol className="m-0 grid list-none gap-2 p-0">
        {rows.map((row) => (
          <Row key={row.player} row={row} onScroll={sync} />
        ))}
      </ol>
      {edges.overflows && !edges.atEnd ? (
        <button
          type="button"
          aria-label="Vėlesni turai"
          className={`${SCROLL_ARROW} -right-2.5`}
          onClick={() => {
            nudge(1);
          }}
        >
          <Icon name="chevron-right" />
        </button>
      ) : null}
    </div>
  );
}
