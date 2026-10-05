import { EntryLink } from './entry-link';
import { LeagueSwitcher } from './league-switcher';
import { NAV_ENTRIES, sectionsFor, type NavEntry } from './nav-entries';
import type { ShellView } from './shell-view';

/**
 * A signed-in player's tab bar along the phone's bottom, below 992px
 * (sportbet's partials/bottom-nav, .sb-bottom-nav): a tab per entry, and
 * the league drop-up when the view's leagueTab says so (showsLeagueTab).
 * sportbet always has three tabs; a bar with none would be no navigation
 * at all, so it is not drawn (a 4b player has none yet). `entries` is
 * NAV_ENTRIES except in tests.
 */
export function BottomTabs({
  view,
  entries = NAV_ENTRIES,
}: {
  view: ShellView;
  entries?: readonly NavEntry[];
}) {
  const { leagues } = view;
  const tabs = sectionsFor(view, 'tabs', entries).flatMap(
    (section) => section.entries,
  );
  const leagueTab = view.leagueTab && leagues !== null;
  if (tabs.length === 0 && !leagueTab) return null;
  return (
    <nav
      data-testid="bottom-tabs"
      className="fixed inset-x-0 bottom-0 z-[1025] flex border-t border-rail-line bg-rail pt-1.5 pb-[env(safe-area-inset-bottom,6px)] lg:hidden"
    >
      {tabs.map((entry) => (
        <EntryLink
          key={entry.href}
          entry={entry}
          surface="tabs"
          badges={view.badges}
        />
      ))}
      {leagueTab ? <LeagueSwitcher leagues={leagues} variant="tab" /> : null}
    </nav>
  );
}
