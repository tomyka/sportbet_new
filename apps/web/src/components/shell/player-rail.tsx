import { RailBrand } from './brand';
import { LeagueSwitcher } from './league-switcher';
import { NAV_ENTRIES, sectionsFor, type NavEntry } from './nav-entries';
import { RAIL, RAIL_CARD, RAIL_CARD_LABEL } from './nav-styles';
import { RailAccount } from './rail-account';
import { RailSections } from './rail-nav';
import { RailTournament } from './rail-tournament';
import type { PlayerShellView } from './shell-view';

/** A player in no league still gets the league row, saying "Lyga" (sportbet's partials/rail). */
const NO_LEAGUES = { items: [] };

/**
 * A signed-in player's rail (sportbet's partials/rail): the brand; the
 * card naming the tournament (when there is one) and the league the menu
 * is scoped to, above the menu it scopes (#69); the rail's blocks
 * (sectionsFor); and the account section at the foot. `entries` is
 * NAV_ENTRIES except in tests.
 */
export function PlayerRail({
  view,
  entries = NAV_ENTRIES,
}: {
  view: PlayerShellView;
  entries?: readonly NavEntry[];
}) {
  const { tournament } = view;
  return (
    <aside data-testid="rail" className={RAIL}>
      <RailBrand />
      <div
        data-testid="rail-context"
        className="mb-2 border-b border-rail-line px-4 pb-3.5"
      >
        <div className={RAIL_CARD}>
          {tournament === null ? null : (
            <RailTournament tournament={tournament} />
          )}
          {/* .sb-rail-card-row, ruled off from the tournament above it */}
          <div
            className={
              tournament === null
                ? ''
                : 'mt-[9px] border-t border-rail-line pt-[9px]'
            }
          >
            <span className={RAIL_CARD_LABEL}>Lyga</span>
            <LeagueSwitcher
              leagues={view.leagues ?? NO_LEAGUES}
              variant="rail"
              invites={view.badges.invites}
            />
          </div>
        </div>
      </div>
      <RailSections
        sections={sectionsFor(view, 'rail', entries)}
        badges={view.badges}
      />
      <RailAccount player={view.player} />
    </aside>
  );
}
