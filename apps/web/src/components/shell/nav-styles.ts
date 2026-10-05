// Class lists more than one shell part draws, transcribed from sportbet's
// public/css/custom.css at 1ac955f (each names its rule). A link's `idle`
// and `current` lists are applied one or the other (nav-link.tsx), never
// layered, so no two utilities compete for one property.

/** A link's classes: always `base`, then `idle` or `current` (nav-link.tsx). */
export interface LinkStyles {
  readonly base: string;
  readonly idle: string;
  readonly current: string;
}

/** .sb-rail with d-none d-lg-flex: the desktop rail, from 992px. */
export const RAIL =
  'sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-rail-line bg-rail py-[14px] lg:flex';

/** .sb-rail-link; `caps` is every rail link but the player's own name (.sb-rail-link--you). */
export const RAIL_LINK = {
  base: 'flex items-center gap-2.5 border-l-[3px] px-4 py-2.5 text-[0.92rem] font-semibold no-underline',
  caps: 'tracking-[0.04em] uppercase',
  idle: 'border-transparent text-rail-dim hover:bg-rail-row hover:text-on-rail',
  current: 'border-rail-accent bg-rail-row text-on-rail',
};

/** .sb-rail-label */
export const RAIL_LABEL =
  'px-4 pb-[5px] text-[0.7rem] tracking-[0.16em] text-rail-dim uppercase';

/** .sb-rail-sep */
export const RAIL_SEP = 'mx-4 my-2.5 h-px bg-rail-line';

/** .sb-rail-card: the tournament and league card, in the rail and the phone menu. */
export const RAIL_CARD =
  'rounded-sm border border-rail-line bg-rail-raised px-2.5 py-[9px]';

/** .sb-rail-card-label */
export const RAIL_CARD_LABEL =
  'mb-[3px] block text-[0.62rem] font-bold tracking-[0.14em] text-rail-dim uppercase';

/** .sb-mobile-collapse .sb-nav-link: a link in the phone menu. */
export const MENU_LINK = {
  base: 'inline-flex items-center gap-1 rounded-[6px] px-2.5 py-[7px] text-[0.82rem] font-semibold whitespace-nowrap text-on-rail no-underline transition-[color,background-color] duration-150',
  idle: 'hover:bg-rail-wash-md',
  current: 'bg-rail-wash-lg',
};

/** .sb-tab: a bottom tab. */
export const TAB = {
  base: 'relative flex flex-1 flex-col items-center gap-0.5 py-1 no-underline transition-colors duration-150',
  idle: 'text-rail-dim hover:text-on-rail',
  current: 'text-rail-accent',
};

/** .sb-nav-pill: the guest's "Prisijungti" on the phone bar, in the accent, icon only below 576px. */
export const LOGIN_PILL =
  'rounded-full border-2 border-accent px-5 py-1.5 text-[0.875rem] leading-[1.4] font-semibold whitespace-nowrap text-accent no-underline transition-[background-color,color] duration-150 hover:bg-accent hover:text-on-accent max-sm:px-3';

/** .sb-rail-login, in .sb-rail-foot: the guest rail's "Prisijungti". */
export const RAIL_LOGIN =
  'flex items-center justify-center gap-2 rounded-md bg-accent px-3.5 py-2.5 text-[0.92rem] font-bold text-on-accent no-underline hover:opacity-90';

/** .sb-nav-pill.sb-nav-pill--ghost: a guest's pill on the phone bar, an icon and its label from 576px. */
export const PILL =
  'rounded-full border-2 border-transparent px-5 py-1.5 text-[0.875rem] leading-[1.4] font-medium whitespace-nowrap text-muted no-underline transition-[background-color,color] duration-150 hover:text-accent max-sm:px-3';
