'use client';

import type { JSX, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icon';
import { TAB } from './nav-styles';
import { LEAGUE_SWITCH_PATH } from './shell-paths';
import type { ShellLeague, ShellLeagues } from './shell-view';

// Bootstrap 5.0's .dropdown-menu and .dropdown-item as sportbet re-skins
// them (custom.css :265-270).
const MENU =
  'absolute right-0 z-[1000] list-none rounded-sm border border-border bg-card py-2';
const ITEM = 'block w-full px-4 py-1 text-left text-base whitespace-nowrap';
const ITEM_IDLE =
  'cursor-pointer border-none bg-transparent text-text hover:bg-surface-2';
const ITEM_CURRENT = 'bg-accent text-on-accent';

// Bootstrap 5.0's .badge.bg-danger.ms-1 with sportbet's inline size
// (partials/league-switcher): the pending invites, on the toggle.
const INVITES =
  'ml-1 inline-block rounded-sm bg-bad px-[5px] py-[2px] text-center align-baseline text-[0.55rem] leading-none font-bold whitespace-nowrap text-on-state';

/** A menu open or shut: shut by a click outside `root` or by Escape. */
function useMenu(): {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly root: RefObject<HTMLDivElement | null>;
} {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        root.current?.contains(event.target) !== true
      )
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return {
    open,
    toggle: () => {
      setOpen(!open);
    },
    root,
  };
}

/** The phone's last bottom tab: a drop-up of the leagues other than the active one. */
function TabSwitcher({
  leagues,
  label,
}: {
  leagues: ShellLeagues;
  label: string;
}): JSX.Element {
  const { open, toggle, root } = useMenu();
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

/** In the rail's card: every league in order, the active one ticked where it falls, and the pending invites on the toggle. */
function RailSwitcher({
  leagues,
  label,
  invites,
}: {
  leagues: ShellLeagues;
  label: string;
  invites: number;
}): JSX.Element {
  const { open, toggle, root } = useMenu();
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="block max-w-full cursor-pointer truncate rounded-sm border-none bg-transparent py-1 pr-2.5 text-left text-[0.82rem] font-semibold text-on-rail hover:bg-rail-wash-md"
      >
        {label}
        {invites > 0 ? (
          <>
            {' '}
            <span data-invites className={INVITES}>
              {invites}
            </span>
          </>
        ) : null}
      </button>
      <ul
        hidden={!open}
        className={`${MENU} top-full mt-0.5 max-w-[212px] min-w-[180px]`}
      >
        {leagues.items.map((league) => (
          <li key={league.id}>
            {league.active ? (
              <span aria-current="true" className={`${ITEM} ${ITEM_CURRENT}`}>
                <span className="mr-1">
                  <Icon name="check2" />
                </span>
                {league.name}
              </span>
            ) : (
              <SwitchTo league={league} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The player's leagues in this tournament, to switch between: in the
 * rail's card, every league in order with the active one ticked where it
 * falls (sportbet's partials/league-switcher), or as the phone's last
 * bottom tab, a drop-up of the others (partials/bottom-nav). The toggle
 * names the active league, or says "Lyga" when none is; in the rail it
 * also counts the pending league invites, as sportbet's does. Opens on a
 * click; closes on a click outside it or Escape. sportbet hides
 * Bootstrap's dropdown caret on both toggles (custom.css :478, :961), so
 * neither draws one.
 */
export function LeagueSwitcher({
  leagues,
  variant,
  invites = 0,
}: {
  leagues: ShellLeagues;
  variant: 'rail' | 'tab';
  /** Pending league invites (badges.invites); drawn in the rail only. */
  invites?: number;
}): JSX.Element {
  const label = leagues.items.find((league) => league.active)?.name ?? 'Lyga';
  return variant === 'tab' ? (
    <TabSwitcher leagues={leagues} label={label} />
  ) : (
    <RailSwitcher leagues={leagues} label={label} invites={invites} />
  );
}

function SwitchTo({ league }: { league: ShellLeague }) {
  return (
    <form method="post" action={LEAGUE_SWITCH_PATH}>
      <input type="hidden" name="leagueID" value={String(league.id)} />
      <button type="submit" className={`${ITEM} ${ITEM_IDLE}`}>
        {league.name}
      </button>
    </form>
  );
}
