// The profile cards' shared classes, on the colour tokens only: the field
// styles of the leagues' forms, sportbet's `sb-card-title` icons, and the
// refusal list sportbet draws as a `alert alert-danger`.

export const LABEL = 'mb-1 block text-[0.75rem] font-semibold text-muted';

export const INPUT =
  'w-full rounded-md border border-border bg-card px-2 py-1.5 text-[0.9rem] text-text placeholder:text-dim';

/** A field a refusal names: outlined as sportbet's `is-invalid`. */
export const INPUT_INVALID = `${INPUT} border-bad`;

/** The refusals of one bag, listed. */
export const REFUSALS =
  'mb-3 rounded-[6px] border border-bad bg-bad-tint px-4 py-2 text-bad';

export const REFUSAL_ITEM = 'text-[0.83rem]';

/** A secondary action drawn as a link, "Atšaukti keitimą". */
export const LINK_BUTTON =
  'cursor-pointer border-none bg-transparent p-0 text-[0.8rem] text-muted underline';

/** The danger zone's red buttons. */
export const BUTTON_DANGER =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-bad px-5 py-2 text-[0.875rem] font-semibold whitespace-nowrap text-on-state';

export const BUTTON_DANGER_OUTLINE =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-bad bg-transparent px-4 py-1 text-[0.8rem] font-semibold whitespace-nowrap text-bad';
