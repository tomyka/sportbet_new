import type { JSX } from 'react';
import Link from 'next/link';
import { Icon } from './icon';
import { NavBadge } from './nav-badge';
import type { NavEntry, NavSurface } from './nav-entries';
import { NavLink } from './nav-link';
import { MENU_LINK, PILL, RAIL_LINK, TAB, type LinkStyles } from './nav-styles';
import type { ShellBadges } from './shell-view';

/**
 * How each surface that marks the current page draws a link (sportbet's
 * .sb-rail-link, the phone menu's .sb-nav-link, .sb-tab). Its badge sits
 * on the same surface, which places it and its tip (nav-badge.tsx).
 */
const LINK_BY_SURFACE: Record<
  Exclude<NavSurface, 'pills'>,
  { readonly styles: LinkStyles; readonly className?: string }
> = {
  rail: { styles: RAIL_LINK, className: RAIL_LINK.caps },
  menu: { styles: MENU_LINK },
  tabs: { styles: TAB },
};

/**
 * One navigation entry as a surface draws it: its icon and label, and its
 * badge counted from the view. The rail, the phone menu and the bottom
 * tabs mark the current page; a guest's pill on the phone bar does not,
 * shows its label only from 576px, and carries no badge (sportbet's
 * partials/header).
 */
export function EntryLink({
  entry,
  surface,
  badges,
}: {
  entry: NavEntry;
  surface: NavSurface;
  badges: ShellBadges;
}): JSX.Element {
  if (surface === 'pills') {
    return (
      <Link href={entry.href} aria-label={entry.label} className={PILL}>
        <span className="text-[0.75rem]">
          <Icon name={entry.icon} />
        </span>
        <span className="hidden sm:inline"> {entry.label}</span>
      </Link>
    );
  }
  const { styles, className } = LINK_BY_SURFACE[surface];
  return (
    <NavLink href={entry.href} styles={styles} className={className}>
      {surface === 'tabs' ? (
        <>
          <span className="text-[1.2rem] leading-none">
            <Icon name={entry.icon} />
          </span>
          <span className="text-[0.62rem]">{entry.label}</span>
        </>
      ) : (
        <>
          <Icon name={entry.icon} /> {entry.label}
        </>
      )}
      {entry.badge === undefined ? null : (
        <NavBadge
          kind={entry.badge}
          count={badges[entry.badge]}
          placement={surface}
        />
      )}
    </NavLink>
  );
}
