import {
  paymentDetailsFormEntry,
  paymentsFormEntry,
  type DetailsEntry,
  type DetailsField,
  type PaymentsEntry,
} from '@sportbet/domain';
import { formText } from '../request/form-input';
import { validationBody } from '../request/laravel-answers';

/** The 422 body of a refused form: Laravel's English, every failed rule listed. */
type Body = ReturnType<typeof validationBody<string>>;

/** The `paid` map read, or the 422 body listing every refused row. */
export type PaymentsRead =
  | { readonly ok: true; readonly entry: PaymentsEntry }
  | { readonly ok: false; readonly body: Body };

/** `paid[<key>]` and what follows the key (`[x]` of a nested `paid[7][x]`). */
const PAID_ENTRY = /^paid\[([^\]]*)\](.*)$/su;

/**
 * What `paid` was posted as, as PHP reads it: `paid[12]` an entry under
 * "12" (the last of a repeated key wins), `paid[12][x]` an array in that
 * entry (no string, so no number), a bare `paid` its string, and no `paid`
 * at all null.
 */
function postedPaid(
  form: FormData,
): ReadonlyMap<string, unknown> | string | null {
  const entries = new Map<string, unknown>();
  let bare: string | null = null;
  for (const [name, value] of form.entries()) {
    if (name === 'paid' && typeof value === 'string') bare = value;
    const found = PAID_ENTRY.exec(name);
    if (found === null) continue;
    const [, key = '', rest = ''] = found;
    entries.set(key, rest === '' ? value : { nested: true });
  }
  return entries.size > 0 ? entries : bare;
}

/**
 * UpdateLeaguePaymentsRequest on a posted form: the `paid` map through
 * `paymentsFormEntry` (every rule that fails, row by row), a refusal as the
 * 422 body of Laravel's JSON answer.
 */
export function readPaymentsForm(form: FormData): PaymentsRead {
  const checked = paymentsFormEntry(postedPaid(form));
  if (checked.ok) return { ok: true, entry: checked.value };
  return {
    ok: false,
    body: validationBody(
      checked.errors.map(({ field, message }) => ({ field, message })),
    ),
  };
}

const DETAILS_FIELDS: readonly DetailsField[] = [
  'payment_beneficiary',
  'payment_iban',
  'payment_note',
];

/** What the details form answers: the entry, a 422 body, or a refusal to flash. */
export type DetailsRead =
  | { readonly kind: 'ok'; readonly entry: DetailsEntry }
  | { readonly kind: 'invalid'; readonly body: Body }
  | {
      readonly kind: 'refused';
      readonly message: 'details-iban-invalid' | 'details-half-pair';
    };

/**
 * UpdateLeaguePaymentDetailsRequest on a posted form: each box trimmed as
 * TrimStrings does, then `paymentDetailsFormEntry`. A length rule is the
 * 422 body; the IBAN's checksum and the both-or-neither rule are the
 * refusals the page shows as its error message (open question 5: a 303
 * with the message, the typed values not kept).
 */
export function readDetailsForm(form: FormData): DetailsRead {
  const checked = paymentDetailsFormEntry(
    Object.fromEntries(
      DETAILS_FIELDS.map((field) => [field, formText(form, field)]),
    ),
  );
  if (checked.ok) return { kind: 'ok', entry: checked.value };
  const [first] = checked.errors;
  if (first?.rule === 'iban') {
    return { kind: 'refused', message: 'details-iban-invalid' };
  }
  if (first?.rule === 'pair') {
    return { kind: 'refused', message: 'details-half-pair' };
  }
  return {
    kind: 'invalid',
    body: validationBody(
      checked.errors.map(({ field, message }) => ({ field, message })),
    ),
  };
}
