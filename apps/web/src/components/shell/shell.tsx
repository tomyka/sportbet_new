import type { ReactNode } from 'react';
import { BottomTabs } from './bottom-tabs';
import { CookieConsent } from './cookie-consent';
import { GuestRail } from './guest-rail';
import { NAV_ENTRIES, privacyHref, type NavEntry } from './nav-entries';
import { PhoneHeader } from './phone-header';
import { PlayerRail } from './player-rail';
import { isPlayerView, type ShellView } from './shell-view';

/**
 * The frame every page sits in (sportbet's layouts/master): the rail from
 * 992px, the phone bar below it, the page in the centred container, the
 * bottom tabs for a player, and the cookie banner. Told everything by the
 * view; `entries` is NAV_ENTRIES except in tests.
 */
export function Shell({
  view,
  adsenseClient,
  entries = NAV_ENTRIES,
  children,
}: {
  view: ShellView;
  adsenseClient: string | null;
  entries?: readonly NavEntry[];
  children: ReactNode;
}) {
  return (
    // .sb-layout (its colours and font are sportbet's body rule, globals.css)
    <div className="flex min-h-screen flex-col">
      {/* .sb-shell: two columns from 992px, the rail's 212px and the rest */}
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[212px_1fr]">
        {isPlayerView(view) ? (
          <PlayerRail view={view} entries={entries} />
        ) : (
          <GuestRail view={view} entries={entries} />
        )}
        {/* .sb-shell-main: min-w-0 lets the column shrink below its content on a phone */}
        <div className="flex min-h-full min-w-0 flex-col">
          <PhoneHeader view={view} entries={entries} />
          {/* .sb-main and .sb-container: sideways overflow is clipped here,
              never on <body> (sportbet's LayoutOverflowRegressionTest) */}
          <main className="flex-1 overflow-x-hidden pt-6 pb-[calc(72px_+_env(safe-area-inset-bottom,0px))] lg:pb-6">
            <div className="mx-auto w-full max-w-[1280px] px-5">{children}</div>
          </main>
        </div>
      </div>
      {isPlayerView(view) ? <BottomTabs view={view} entries={entries} /> : null}
      <CookieConsent
        adsenseClient={adsenseClient}
        privacyHref={privacyHref(entries)}
      />
    </div>
  );
}
