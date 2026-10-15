// The admin structure pages' shared classes (slice 13): sportbet's
// .sb-card, its table and its form controls on the colour tokens only.

/** A form control's label. */
export const FIELD_LABEL = 'mb-1 block text-[0.75rem] font-semibold text-muted';

/** A text, number, date or select box. */
export const FIELD_INPUT =
  'w-full rounded-md border border-border bg-card px-2 py-1 text-[0.85rem] text-text';

/** A box small enough for a number in a table cell. */
export const TINY_INPUT = `${FIELD_INPUT} w-16 text-center`;

/** A table of the lists. */
export const TABLE = 'w-full border-collapse text-[0.85rem]';

export const TH =
  'border-b border-border px-2 py-2 text-left text-[0.75rem] font-semibold text-muted';

export const TD = 'border-b border-border px-2 py-1.5 align-middle';

/** A small outlined action button (sportbet's btn-outline-secondary btn-sm). */
export const ACTION_BUTTON =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1 text-[0.8rem] font-semibold text-text no-underline hover:border-accent hover:text-accent';

/** A small primary button (sportbet's btn-primary btn-sm). */
export const PRIMARY_BUTTON =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1 text-[0.8rem] font-semibold text-on-accent no-underline hover:bg-accent-hover';

/** A small destructive button. */
export const DANGER_BUTTON =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-bad bg-transparent px-3 py-1 text-[0.8rem] font-semibold text-bad hover:bg-bad hover:text-on-state';

/** The card's title row. */
export const TITLE_ROW = 'mb-3 flex items-center justify-between gap-2';

/** The columns of a round's row on /admin/events; the header, every row and the insert row share them. */
export const ROUND_GRID =
  'grid min-w-[44rem] grid-cols-[2.5rem_minmax(9rem,1fr)_4.5rem_3.5rem_3.5rem_9rem_4.5rem_2.5rem] items-center gap-2 border-b border-border py-1.5';
