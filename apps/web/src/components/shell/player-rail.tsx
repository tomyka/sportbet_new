import type { JSX } from 'react';
import { RailBrand } from './brand';
import { ContextSwitch } from './context-switch';
import { NAV_ENTRIES, sectionsFor, type NavEntry } from './nav-entries';
import { RAIL } from './nav-styles';
import { RailAccount } from './rail-account';
import { RailSections } from './rail-nav';
import { SHELL_LINKS, type ShellLinks } from './shell-paths';
import type { PlayerShellView } from './shell-view';

/**
 * A signed-in player's rail (sportbet's partials/rail): the brand; the
 * context switch naming the tournament (when there is one) and, once the
 * app knows leagues (slice 12), the league the menu is scoped to, above the
 * menu it scopes (#69); the rail's blocks (sectionsFor); and the account section
 * at the foot. `entries` is NAV_ENTRIES and `links` SHELL_LINKS except in
 * tests.
 */
export function PlayerRail({
  view,
  entries = NAV_ENTRIES,
  links = SHELL_LINKS,
}: {
  view: PlayerShellView;
  entries?: readonly NavEntry[];
  links?: ShellLinks;
}): JSX.Element {
  const { tournament, leagues } = view;
  return (
    <aside data-testid="rail" className={RAIL}>
      <RailBrand player />
      {tournament === null && leagues === null ? null : (
        <div
          data-testid="rail-context"
          className="mb-2 border-b border-rail-line px-4 pb-3.5"
        >
          <ContextSwitch
            tournament={tournament}
            leagues={leagues}
            exitHref={links.tournamentExit}
            invites={view.badges.invites}
          />
        </div>
      )}
      <RailSections
        sections={sectionsFor(view, 'rail', entries)}
        badges={view.badges}
      />
      <RailAccount player={view.player} links={links} />
    </aside>
  );
}
