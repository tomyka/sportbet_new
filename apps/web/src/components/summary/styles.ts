// The summaries' shared classes: sportbet's .sr-* table (custom.css,
// "Summary results table") and the popover rows, on the colour tokens only.

/** .sr-pop-row: a label and its value, apart. */
export const POP_ROW = 'flex justify-between gap-4 py-0.5';

/** .sr-pop-sub: a line under another, set in. */
export const POP_SUB = 'pl-2.5 opacity-80';

/** .sr-pop: the popover's box. */
export const POP_BOX =
  'rounded-[6px] border border-border bg-card p-2 text-left text-[0.78rem] font-normal whitespace-nowrap text-text shadow-[0_2px_8px_var(--color-shadow-strong)]';

/** .sr-my-col: the viewer's column, opaque so the sticky header and footer do not bleed. */
export const MY_COLUMN = 'bg-accent-tint-solid';

/** The sticky first column's ground and edge (.sr-sticky-col). */
export const STICKY_COLUMN =
  'sticky left-0 z-[1] shadow-[4px_0_10px_var(--color-shadow)]';
