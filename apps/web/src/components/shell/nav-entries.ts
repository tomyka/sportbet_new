import type { IconName } from './icon';
import { MAIN_PATH, PREDICTIONS_PATH } from './shell-paths';
import type { BadgeKind, ShellView } from './shell-view';

/** Where an entry is drawn: the desktop rail, the phone's menu panel, the phone's bottom tabs, or the guest phone bar's pills. */
export type NavSurface = 'rail' | 'menu' | 'tabs' | 'pills';

/**
 * The block an entry sits in, as sportbet's rail and phone menu group them
 * (partials/rail, rail-guest, header): `main` is the rail's first block
 * and the menu's "Spėjimai"; `summary` is "Suvestinė"; `league` and
 * `info` follow the rail's separator, and are the menu's "Lyga" and
 * "Informacija".
 */
export type NavGroup = 'main' | 'summary' | 'league' | 'info';

export interface NavEntry {
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  readonly audience: 'guest' | 'player';
  readonly group: NavGroup;
  readonly surfaces: readonly NavSurface[];
  readonly badge?: BadgeKind;
  /** When it shows, besides its audience: e.g. survival only in a tournament with a survival game. */
  readonly shownWhen?: (view: ShellView) => boolean;
}

/**
 * Every navigation entry, in sportbet's order. An entry is listed only once
 * its page exists in this app, so the shell never links to a 404 (spec 4a,
 * "Navigation entries"; nav-entries.test.ts checks every href has a page).
 * Each slice adds its own; "Prisijungti" arrives with 4b.
 */
export const NAV_ENTRIES: readonly NavEntry[] = [
  {
    label: 'Turnyrai',
    href: '/',
    icon: 'globe2',
    audience: 'guest',
    group: 'main',
    surfaces: ['rail'],
  },
  {
    // partials/rail.blade.php's first link; the phone menu and tabs have none.
    label: 'Pradžia',
    href: MAIN_PATH,
    icon: 'house',
    audience: 'player',
    group: 'main',
    surfaces: ['rail'],
  },
  {
    // sportbet's $matchIcon: the format's ball (config/help.php) - the
    // Euroleague's, the one format this app plays (decision 11).
    label: 'Spėjimai',
    href: PREDICTIONS_PATH,
    icon: 'sports-basketball',
    audience: 'player',
    group: 'main',
    surfaces: ['rail', 'menu', 'tabs'],
    badge: 'results',
  },
];

/** The entries this view shows on this surface. */
export function entriesFor(
  view: ShellView,
  surface: NavSurface,
  entries: readonly NavEntry[] = NAV_ENTRIES,
): readonly NavEntry[] {
  const audience = view.player === null ? 'guest' : 'player';
  return entries.filter(
    (entry) =>
      entry.audience === audience &&
      entry.surfaces.includes(surface) &&
      (entry.shownWhen?.(view) ?? true),
  );
}

/** A labelled block of entries, as a surface draws it. */
export interface NavSection {
  readonly label: string | null;
  readonly entries: readonly NavEntry[];
}

interface SectionPlan {
  readonly label: string | null;
  readonly groups: readonly NavGroup[];
}

const EVERY_GROUP: readonly NavGroup[] = ['main', 'summary', 'league', 'info'];

/**
 * Each surface's blocks, in sportbet's order: the rail's main block, then
 * "Suvestinė", then the league and information entries after a separator
 * (partials/rail, rail-guest); the phone menu's "Spėjimai", "Suvestinė",
 * "Informacija" and "Lyga" (partials/header); the bottom tabs and the
 * guest bar's pills one unlabelled row. Within a block, entries keep the
 * order they are listed in.
 */
const SECTIONS: Readonly<Record<NavSurface, readonly SectionPlan[]>> = {
  rail: [
    { label: null, groups: ['main'] },
    { label: 'Suvestinė', groups: ['summary'] },
    { label: null, groups: ['league', 'info'] },
  ],
  menu: [
    { label: 'Spėjimai', groups: ['main'] },
    { label: 'Suvestinė', groups: ['summary'] },
    { label: 'Informacija', groups: ['info'] },
    { label: 'Lyga', groups: ['league'] },
  ],
  tabs: [{ label: null, groups: EVERY_GROUP }],
  pills: [{ label: null, groups: EVERY_GROUP }],
};

/** The blocks this view shows on this surface, empty ones dropped. */
export function sectionsFor(
  view: ShellView,
  surface: NavSurface,
  entries: readonly NavEntry[] = NAV_ENTRIES,
): readonly NavSection[] {
  const shown = entriesFor(view, surface, entries);
  return SECTIONS[surface]
    .map(({ label, groups }) => ({
      label,
      entries: shown.filter((entry) => groups.includes(entry.group)),
    }))
    .filter((section) => section.entries.length > 0);
}

const PRIVACY_PATH = '/privacy';

/** The privacy page, once it is listed: the cookie banner links to it (sportbet's partials/cookie-consent). */
export function privacyHref(
  entries: readonly NavEntry[] = NAV_ENTRIES,
): string | null {
  return entries.some(({ href }) => href === PRIVACY_PATH)
    ? PRIVACY_PATH
    : null;
}
