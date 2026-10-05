import { RailBrand } from './brand';
import { NAV_ENTRIES, sectionsFor, type NavEntry } from './nav-entries';
import { RAIL } from './nav-styles';
import { RailSections } from './rail-nav';
import type { ShellView } from './shell-view';

/**
 * A guest's rail (sportbet's partials/rail-guest): the brand, the public
 * entries, and after a separator the information pages. sportbet's
 * language switch is gone (decision 13); its "Prisijungti" foot arrives
 * with 4b. `entries` is NAV_ENTRIES except in tests.
 */
export function GuestRail({
  view,
  entries = NAV_ENTRIES,
}: {
  view: ShellView;
  entries?: readonly NavEntry[];
}) {
  return (
    <aside data-testid="rail" className={RAIL}>
      <RailBrand />
      <RailSections
        sections={sectionsFor(view, 'rail', entries)}
        badges={view.badges}
      />
    </aside>
  );
}
