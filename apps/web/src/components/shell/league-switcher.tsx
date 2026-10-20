'use client';

import type { JSX } from 'react';
import { Icon } from './icon';
import { TAB } from './nav-styles';
import { activeLeagueName, SwitchTo } from './league-list';
import type { ShellLeagues } from './shell-view';
import { useMenu } from './use-menu';

// Bootstrap 5.0's .dropdown-menu as sportbet re-skins it (custom.css :265-270).
const MENU =
  'absolute right-0 z-[1000] list-none rounded-sm border border-border bg-card py-2';

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
        <span className="max-w-[60px] truncate text-[0.62rem]">
          {activeLeagueName(leagues)}
        </span>
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
