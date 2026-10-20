'use client';

import type { JSX } from 'react';
import { Icon } from './icon';
import { TAB } from './nav-styles';
import { LEAGUE_SWITCH_PATH } from './shell-paths';
import type { ShellLeague, ShellLeagues } from './shell-view';
import { useMenu } from './use-menu';

// Bootstrap 5.0's .dropdown-menu and .dropdown-item as sportbet re-skins
// them (custom.css :265-270).
const MENU =
  'absolute right-0 z-[1000] list-none rounded-sm border border-border bg-card py-2';
export const ITEM =
  'block w-full px-4 py-1 text-left text-base whitespace-nowrap';
const ITEM_IDLE =
  'cursor-pointer border-none bg-transparent text-text hover:bg-surface-2';
export const ITEM_CURRENT = 'bg-accent text-on-accent';

// Bootstrap 5.0's .badge.bg-danger.ms-1 with sportbet's inline size
// (partials/league-switcher): the pending invites, on the context switch.
export const INVITES =
  'ml-1 inline-block rounded-sm bg-bad px-[5px] py-[2px] text-center align-baseline text-[0.55rem] leading-none font-bold whitespace-nowrap text-on-state';

/**
 * The phone's last bottom tab (sportbet's partials/bottom-nav): a drop-up of
 * the leagues other than the active one, under a trophy naming the active
 * league, or "Lyga" when none is. Opens on a click; closes on a click
 * outside it or Escape. The rail's and the phone menu's league list is the
 * context switch's (context-switch.tsx).
 */
export function LeagueSwitcher({
  leagues,
}: {
  leagues: ShellLeagues;
}): JSX.Element {
  const { open, toggle, root } = useMenu();
  const label = leagues.items.find((league) => league.active)?.name ?? 'Lyga';
  return (
    <div ref={root} className="relative flex flex-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={`${TAB.base} ${TAB.idle} cursor-pointer border-none bg-transparent`}
      >
        <span className="text-[1.2rem] leading-none">
          <Icon name="trophy" />
        </span>
        <span className="max-w-[60px] truncate text-[0.62rem]">{label}</span>
      </button>
      <ul hidden={!open} className={`${MENU} bottom-full mb-1 min-w-[10rem]`}>
        {leagues.items
          .filter((league) => !league.active)
          .map((league) => (
            <li key={league.id}>
              <SwitchTo league={league} />
            </li>
          ))}
      </ul>
    </div>
  );
}

/** A league other than the active one: a form posting its id to the switch route. */
export function SwitchTo({ league }: { league: ShellLeague }): JSX.Element {
  return (
    <form method="post" action={LEAGUE_SWITCH_PATH}>
      <input type="hidden" name="leagueID" value={String(league.id)} />
      <button type="submit" className={`${ITEM} ${ITEM_IDLE}`}>
        {league.name}
      </button>
    </form>
  );
}
