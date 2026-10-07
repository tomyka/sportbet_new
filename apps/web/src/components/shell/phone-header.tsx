import type { ReactNode } from 'react';
import { PhoneBrand } from './brand';
import { EntryLink } from './entry-link';
import { Icon } from './icon';
import { NAV_ENTRIES, sectionsFor, type NavEntry } from './nav-entries';
import { NavLink } from './nav-link';
import { LOGIN_PILL, MENU_LINK, RAIL_CARD } from './nav-styles';
import { PhoneMenu } from './phone-menu';
import { RailTournament } from './rail-tournament';
import { SHELL_LINKS, type ShellLinks } from './shell-paths';
import {
  isPlayerView,
  type PlayerShellView,
  type ShellView,
} from './shell-view';
import { SignInLink } from './sign-in-link';
import { SignOut } from './sign-out';

/** .sb-topnav, trimmed below 576px (sportbet issue 130). */
const BAR =
  'mx-auto flex h-12 w-full max-w-[1280px] items-center gap-0.5 px-5 max-sm:px-3';

/**
 * The phone's top bar, below 992px (sportbet's partials/header, .sb-navbar):
 * a guest gets the brand, their pills and "Prisijungti"; a player gets the
 * brand and the menu. `entries` is NAV_ENTRIES and `links` SHELL_LINKS
 * except in tests.
 */
export function PhoneHeader({
  view,
  entries = NAV_ENTRIES,
  links = SHELL_LINKS,
}: {
  view: ShellView;
  entries?: readonly NavEntry[];
  links?: ShellLinks;
}) {
  return (
    <nav
      data-testid="phone-header"
      className="bg-rail shadow-[0_1px_8px_var(--color-shadow-strong)] lg:hidden"
    >
      {!isPlayerView(view) ? (
        <div className={BAR}>
          <PhoneBrand player={false} />
          <div className="ml-auto flex items-center gap-1">
            {sectionsFor(view, 'pills', entries)
              .flatMap((section) => section.entries)
              .map((entry) => (
                <EntryLink
                  key={entry.href}
                  entry={entry}
                  surface="pills"
                  badges={view.badges}
                />
              ))}
            <SignInLink className={LOGIN_PILL} label="Prisijungti">
              <span className="text-[0.75rem]">
                <Icon name="box-arrow-in-right" />
              </span>
              <span className="hidden sm:inline"> Prisijungti</span>
            </SignInLink>
          </div>
        </div>
      ) : (
        <PhoneMenu bar={BAR} brand={<PhoneBrand player />}>
          <MenuPanel view={view} entries={entries} links={links} />
        </PhoneMenu>
      )}
    </nav>
  );
}

/** The panel: the tournament card, the menu's blocks (sectionsFor), and the account. */
function MenuPanel({
  view,
  entries,
  links,
}: {
  view: PlayerShellView;
  entries: readonly NavEntry[];
  links: ShellLinks;
}) {
  return (
    <>
      {view.tournament === null ? null : (
        <MenuGroup>
          <div className={RAIL_CARD}>
            <RailTournament
              tournament={view.tournament}
              exitHref={links.tournamentExit}
            />
          </div>
        </MenuGroup>
      )}
      {sectionsFor(view, 'menu', entries).map((section) => (
        <MenuGroup key={section.label} label={section.label}>
          {section.entries.map((entry) => (
            <EntryLink
              key={entry.href}
              entry={entry}
              surface="menu"
              badges={view.badges}
            />
          ))}
        </MenuGroup>
      ))}
      <MenuGroup label="Paskyra">
        {links.profile === null ? null : (
          <NavLink href={links.profile} styles={MENU_LINK}>
            <Icon name="person-fill" /> Profilis
          </NavLink>
        )}
        {view.player.isAdmin && links.admin !== null ? (
          <NavLink href={links.admin} styles={MENU_LINK}>
            <Icon name="database-gear" /> Admin
          </NavLink>
        ) : null}
        <SignOut
          formId="logout-form-m"
          className={`${MENU_LINK.base} ${MENU_LINK.idle} cursor-pointer border-none bg-transparent text-left`}
        />
      </MenuGroup>
    </>
  );
}

/** .sb-mobile-group with its .sb-mobile-label; a line between groups. */
function MenuGroup({
  label = null,
  children,
}: {
  label?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-rail-wash-sm px-4 pt-2.5 pb-1 first:border-t-0">
      {label === null ? null : (
        <div className="px-0.5 pb-1 text-[0.65rem] font-bold tracking-[0.6px] text-rail-dim uppercase">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
