import { RailBrand } from './brand';
import { Icon } from './icon';
import { NAV_ENTRIES, sectionsFor, type NavEntry } from './nav-entries';
import { RAIL, RAIL_LOGIN } from './nav-styles';
import { RailSections } from './rail-nav';
import type { ShellView } from './shell-view';
import { SignInLink } from './sign-in-link';

/**
 * A guest's rail (sportbet's partials/rail-guest): the brand, the public
 * entries, and after a separator the information pages; it ends with
 * "Prisijungti" (.sb-rail-foot). sportbet's language switch is gone
 * (decision 13). `entries` is NAV_ENTRIES except in tests.
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
      <RailBrand player={false} />
      <RailSections
        sections={sectionsFor(view, 'rail', entries)}
        badges={view.badges}
      />
      {/* .sb-rail-foot */}
      <div className="mt-auto flex flex-col gap-2.5 border-t border-rail-line px-4 py-3.5">
        <SignInLink className={RAIL_LOGIN}>
          <Icon name="box-arrow-in-right" /> Prisijungti
        </SignInLink>
      </div>
    </aside>
  );
}
