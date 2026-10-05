import { Icon } from './icon';
import { RAIL_CARD_LABEL } from './nav-styles';
import { TOURNAMENT_EXIT_PATH } from './shell-paths';
import type { ShellTournament } from './shell-view';

/**
 * The tournament the menu is scoped to: label, full name - wrapped, never
 * clipped (sportbet #69) - and the way out of it. Drawn inside a rail card
 * by the rail and by the phone menu (sportbet's partials/rail-tournament).
 * The way out is a plain link: a GET that changes the session must never
 * be prefetched, as next/link would.
 */
export function RailTournament({
  tournament,
}: {
  tournament: ShellTournament;
}) {
  return (
    <>
      <span className={RAIL_CARD_LABEL}>Turnyras</span>
      <span className="block text-[0.82rem] leading-[1.3] font-bold wrap-anywhere text-on-rail">
        {tournament.name}
      </span>
      <a
        href={TOURNAMENT_EXIT_PATH}
        className="mt-[7px] inline-flex items-center gap-[5px] rounded-sm text-[0.72rem] font-bold tracking-[0.04em] text-rail-accent no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Icon name="arrow-left-right" /> Keisti turnyrą
      </a>
    </>
  );
}
