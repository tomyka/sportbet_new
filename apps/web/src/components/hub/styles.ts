// The hub's and the tournament pages' shared classes: sportbet's .sb-card,
// its widget boxes and its .sb-btn variants (custom.css at
// 3eb95e7), on the colour tokens only. Margins are the callers': sportbet
// gives each card its own (mb-4 on the hub, mb-3 on the tournament page).

/** .sb-card without its padding, for a card that sets its own (the hub's empty state). */
export const CARD_FRAME =
  'overflow-x-auto rounded-[12px] border border-border bg-card shadow-[0_1px_4px_var(--color-shadow)]';

export const CARD = `${CARD_FRAME} p-4`;

export const PANEL =
  'h-full rounded-[10px] border border-border bg-surface-2 p-[18px]';

export const PANEL_TITLE = 'mb-[14px] text-[0.88rem] font-bold';

// .sb-btn: a pill. Each variant sets its own padding and size, since two
// utilities for one property in a class list do not override in order.
const PILL =
  'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const SIZE = 'px-5 py-2 text-[0.875rem]';

export const BUTTON_PRIMARY = `${PILL} ${SIZE} cursor-pointer border-none bg-accent text-on-accent hover:bg-accent-hover hover:text-on-accent`;

export const BUTTON_SECONDARY = `${PILL} cursor-pointer border-2 border-accent bg-transparent px-[18px] py-1.5 text-[0.875rem] text-accent hover:bg-accent hover:text-on-accent`;

/**
 * show.blade.php's "← Turnyrai": `sb-btn sb-btn-ghost` at .8rem. sportbet
 * defines no ghost, so it is the bare pill in the link colour.
 */
export const BUTTON_GHOST = `${PILL} cursor-pointer px-5 py-2 text-[0.8rem] text-accent hover:text-accent-hover`;

/** A primary button that is not a link yet (its page arrives in a later slice). */
export const BUTTON_INERT = `${PILL} ${SIZE} bg-accent text-on-accent opacity-60`;
