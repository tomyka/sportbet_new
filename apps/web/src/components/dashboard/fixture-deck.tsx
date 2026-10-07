'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CARD_FRAME, CARD_TITLE } from '../hub/styles';
import { TeamCrest } from '../hub/team-crest';
import { Icon } from '../shell/icon';
import { PREDICTIONS_PATH } from '../shell/shell-paths';
import { AllPredictionsLink } from './all-predictions-link';
import type { GameRow } from './game-row';

/** .sb-scroll-nav, placed as .sb-deck-nav. */
const ARROW =
  'absolute top-1/2 z-[2] grid size-[30px] -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-border bg-surface-2 p-0 text-[1.05rem] leading-none text-text shadow-[0_2px_8px_var(--color-shadow-strong)] hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** One side of a card: crest, name, and the predicted score ("?" when blank). */
function Side({ team, score }: { team: string; score: string }) {
  return (
    <span className="flex items-center gap-2 text-[0.9rem] font-semibold">
      <TeamCrest team={team} size="line" />
      <span className="truncate">{team}</span>
      <span className="ml-auto text-[1.1rem] font-extrabold tabular-nums">
        {score}
      </span>
    </span>
  );
}

/** .sb-deck-card: links to the predictions page, as sportbet's does. */
function Card({ line }: { line: GameRow }) {
  return (
    <a
      data-testid="deck-card"
      href={PREDICTIONS_PATH}
      className={`flex shrink-0 grow-0 basis-[218px] snap-start flex-col gap-[9px] rounded-md border bg-surface-2 px-3 py-[11px] text-inherit no-underline ${line.predict ? 'border-accent' : 'border-border'}`}
    >
      <span className="text-[0.76rem] tracking-[0.1em] text-muted uppercase">
        {`${line.day} · ${line.time}`}
      </span>
      <Side team={line.home} score={line.predictedHome} />
      <Side team={line.away} score={line.predictedAway} />
      <span className="mt-[2px] flex items-center justify-between gap-1.5 border-t border-border pt-2 text-[0.78rem] tracking-[0.08em] text-muted uppercase">
        {line.result === null ? 'Tavo spėjimas' : `Rez ${line.result}`}
        {line.predict ? (
          <span className="font-bold text-accent">Spėti</span>
        ) : null}
      </span>
    </a>
  );
}

/**
 * partials/fixture-deck.blade.php's "Artimiausios rungtynės": the game
 * page's games (fixtureDeck) as cards scrolling sideways, each with its
 * Vilnius day and time, the prediction, "Rez h:a" once played, and "Spėti"
 * on an open game only (R-75: no "Keisti"). The scrollbar is hidden, so
 * the arrows show whenever there is more to scroll to.
 */
export function FixtureDeck({ games }: { games: readonly GameRow[] }) {
  const deck = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });
  const measure = useCallback(() => {
    const element = deck.current;
    if (element === null) return;
    // A couple of pixels of slack: scrollLeft is fractional on a trackpad.
    const max = element.scrollWidth - element.clientWidth;
    setEdges({
      prev: max > 4 && element.scrollLeft > 2,
      next: max > 4 && element.scrollLeft < max - 2,
    });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [measure]);
  const nudge = (direction: 1 | -1) => {
    const element = deck.current;
    if (element === null) return;
    // Most of a screenful, never less than a card and its gap.
    const step = Math.max(element.clientWidth * 0.8, 228);
    element.scrollBy({ left: direction * step, behavior: 'smooth' });
  };
  return (
    <div data-panel="fixture-deck" className={CARD_FRAME}>
      <div
        className={`flex items-center justify-between px-4 pt-4 ${CARD_TITLE}`}
      >
        <span>
          <Icon name="calendar3" /> Artimiausios rungtynės
        </span>
        <AllPredictionsLink />
      </div>
      <div className="relative">
        <button
          type="button"
          aria-label="Ankstesnės rungtynės"
          hidden={!edges.prev}
          onClick={() => {
            nudge(-1);
          }}
          className={`${ARROW} left-1`}
        >
          <Icon name="chevron-left" />
        </button>
        <div
          ref={deck}
          onScroll={measure}
          className="flex snap-x snap-proximity gap-[10px] overflow-x-auto scroll-smooth px-[14px] py-3 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
        >
          {games.map((line) => (
            <Card key={line.game} line={line} />
          ))}
        </div>
        <button
          type="button"
          aria-label="Vėlesnės rungtynės"
          hidden={!edges.next}
          onClick={() => {
            nudge(1);
          }}
          className={`${ARROW} right-1`}
        >
          <Icon name="chevron-right" />
        </button>
      </div>
    </div>
  );
}
