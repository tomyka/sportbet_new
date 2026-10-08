'use client';

import { useState } from 'react';
import { CARD, CARD_TITLE } from '../hub/styles';
import { TeamCrest } from '../hub/team-crest';
import { PointsBreakdown } from '../predictions/points-breakdown';
import { Icon } from '../shell/icon';
import { AllPredictionsLink } from './all-predictions-link';
import type { GameRow } from './game-row';

const NAME =
  'hidden truncate text-[0.82rem] font-medium whitespace-nowrap md:inline';

/**
 * The odds before the result (.upcoming-odds-pop): what a right call on
 * each side pays as the votes stand (R-61), on hover or focus. Euroleague
 * has no draw, so no "Lygiosios" line.
 */
function OddsPop({
  home,
  away,
  odds,
}: {
  home: string;
  away: string;
  odds: NonNullable<GameRow['odds']>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      tabIndex={0}
      aria-label="Koeficientai"
      onMouseEnter={() => {
        setOpen(true);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
      onFocus={() => {
        setOpen(true);
      }}
      onBlur={() => {
        setOpen(false);
      }}
      className="relative cursor-help text-[0.85rem] text-muted hover:text-accent"
    >
      <Icon name="graph-up-arrow" />
      {open ? (
        <span
          role="tooltip"
          className="absolute top-1/2 right-full z-10 mr-2 min-w-[160px] -translate-y-1/2 rounded-[6px] border border-border bg-card p-2 text-left text-[0.78rem] font-normal text-text shadow-[0_2px_8px_var(--color-shadow-strong)]"
        >
          <OddsLine team={home} points={odds.home} />
          <OddsLine team={away} points={odds.away} />
        </span>
      ) : null}
    </span>
  );
}

/** .sr-pop-row: a side and what a right call on it pays now. */
function OddsLine({ team, points }: { team: string; points: string }) {
  return (
    <span className="flex justify-between gap-4 py-[2px]">
      <span className="text-muted">{team}</span>
      <strong className="font-bold">{`+${points} pt`}</strong>
    </span>
  );
}

/** The row's date, teams and scores: .upcoming-row's first four tracks. */
function RowBody({ line }: { line: GameRow }) {
  return (
    <>
      <span className="flex flex-col text-[0.72rem] leading-[1.3] whitespace-nowrap text-muted">
        <span>{line.day}</span>
        <span className="font-semibold">{line.time}</span>
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5">
        <TeamCrest team={line.home} size="line" />
        <span className={NAME}>{line.home}</span>
      </span>
      <span className="flex min-w-[72px] items-center justify-center gap-[3px] whitespace-nowrap">
        {line.result === null ? (
          <span className="text-[0.82rem] font-bold text-accent">
            {line.predicted}
          </span>
        ) : (
          <>
            <span className="text-[0.82rem] font-bold text-text">
              {line.result}
            </span>
            <span className="text-[0.72rem] text-muted">/</span>
            <span className="text-[0.78rem] text-muted">{line.predicted}</span>
          </>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={NAME}>{line.away}</span>
        <TeamCrest team={line.away} size="line" />
      </span>
    </>
  );
}

/**
 * One game's row (.upcoming-row): a link to the game's own page, which
 * takes its prediction (R-74 amended), beside its points or odds.
 */
function Row({ line }: { line: GameRow }) {
  return (
    <div
      data-testid="games-row"
      className="grid grid-cols-[52px_1fr_auto_1fr_auto] items-center gap-1.5 rounded-[6px] border-b border-border px-1 py-[7px] text-text transition-colors last:border-b-0 hover:bg-surface-2"
    >
      <a
        href={line.href}
        className="col-span-4 grid grid-cols-subgrid items-center text-inherit no-underline"
      >
        <RowBody line={line} />
      </a>
      <span className="flex min-w-9 justify-end">
        {line.result !== null ? (
          <PointsBreakdown points={line.points} />
        ) : line.odds !== null ? (
          <OddsPop home={line.home} away={line.away} odds={line.odds} />
        ) : null}
      </span>
    </div>
  );
}

/**
 * partials/games.blade.php's "Visos rungtynės": the game page's games, each
 * its Vilnius day and time, the crests (names from md), the result over the
 * prediction, and its points with their breakdown - or, before the result,
 * the odds (R-61). It takes no prediction (R-74 amended): a click on a game
 * opens the game's own page, in place of sportbet's double-click window.
 */
export function GamesList({ games }: { games: readonly GameRow[] }) {
  return (
    <div data-panel="games-list" className={CARD}>
      <div className={`mb-3 flex items-center justify-between ${CARD_TITLE}`}>
        <span>
          <Icon name="list-ul" /> Visos rungtynės
        </span>
        <AllPredictionsLink />
      </div>
      <div className="flex flex-col">
        {games.map((line) => (
          <Row key={line.game} line={line} />
        ))}
      </div>
    </div>
  );
}
