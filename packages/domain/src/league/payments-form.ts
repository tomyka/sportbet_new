import { idFromText } from '../shared/ids';
import { phpTrim } from '../shared/php-trim';
import { checkAmount, type AmountRule } from './amount';
import { ibanCompact, isValidIban } from './iban';
import type { Cents } from './league';

/** Member id -> the amount recorded (null: unpaid). */
export type PaymentsEntry = ReadonlyMap<number, Cents | null>;

/**
 * What `paid` was posted as: its entries in the order they came, by the key
 * text (`paid[12]` is "12"; a nested value is anything but a string); a bare
 * `paid=x` is the string; a post without `paid` is null.
 */
export type PaymentsPosted = ReadonlyMap<string, unknown> | string | null;

/** The rules of UpdateLeaguePaymentsRequest that can fail. */
export type PaymentsRule = 'required' | 'array' | AmountRule;

/** One failed rule, worded as Laravel words it (`paid.<id>` the attribute). */
export interface PaymentsFieldError {
  readonly field: string;
  readonly rule: PaymentsRule;
  readonly message: string;
}

export type PaymentsFormCheck =
  | { readonly ok: true; readonly value: PaymentsEntry }
  | { readonly ok: false; readonly errors: readonly PaymentsFieldError[] };

/** Laravel's `Str::trim`: Unicode white space and three invisible marks. */
const LARAVEL_TRIM = new RegExp(
  '^[\\p{White_Space}\\uFEFF\\u200B\\u200E]+|[\\p{White_Space}\\uFEFF\\u200B\\u200E]+$',
  'gu',
);

/**
 * `Str::snake` and then underscores to spaces, as Laravel names an attribute
 * in a message: `paid.12` stays, an upper-case letter starts a new word.
 */
function displayName(attribute: string): string {
  const joined = attribute
    .replace(
      /(^|[ \t\r\n\f\v])(\p{Ll})/gu,
      (_all, before: string, letter: string) =>
        `${before}${letter.toUpperCase()}`,
    )
    .replace(/\s+/gu, '');
  return joined
    .replace(/(.)(?=[A-Z])/gu, '$1_')
    .toLowerCase()
    .replace(/_/gu, ' ');
}

const AMOUNT_MESSAGES: Readonly<Record<AmountRule, (name: string) => string>> =
  {
    numeric: (name) => `The ${name} field must be a number.`,
    decimal: (name) => `The ${name} field must have 0-2 decimal places.`,
    min: (name) => `The ${name} field must be at least 0.`,
    max: (name) => `The ${name} field must not be greater than 999999.99.`,
  };

function amountErrors(key: string, value: unknown): PaymentsFieldError[] {
  const field = `paid.${key}`;
  return failedAmountRules(value).map((rule) => ({
    field,
    rule,
    message: AMOUNT_MESSAGES[rule](displayName(field)),
  }));
}

/** An amount that is no string is no number: the array, as Laravel reads it. */
function failedAmountRules(value: unknown): readonly AmountRule[] {
  if (typeof value !== 'string') return ['numeric', 'decimal'];
  const checked = checkAmount(value);
  return checked.ok ? [] : checked.failed;
}

/** A box's text as the request prepares it: trimmed, a comma read as a point. */
function preparedText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(LARAVEL_TRIM, '').replace(',', '.');
}

const isBlank = (value: unknown): boolean =>
  value === null || value === undefined || value === '';

const ARRAY_REFUSAL: PaymentsFieldError = {
  field: 'paid',
  rule: 'array',
  message: 'The paid field must be an array.',
};

const REQUIRED_REFUSAL: PaymentsFieldError = {
  field: 'paid',
  rule: 'required',
  message: 'The paid field is required.',
};

/** `paid`: `required|array`, then its entries; or the rule it fails. */
function postedEntries(
  posted: PaymentsPosted,
): { readonly entries: ReadonlyMap<string, unknown> } | PaymentsFieldError {
  if (typeof posted === 'string') {
    return isBlank(preparedText(posted)) ? REQUIRED_REFUSAL : ARRAY_REFUSAL;
  }
  return posted === null || posted.size === 0
    ? REQUIRED_REFUSAL
    : { entries: posted };
}

/**
 * UpdateLeaguePaymentsRequest on the posted `paid` map: `paid` required and an
 * array, then for every entry (a blank one is unpaid, `nullable`) numeric,
 * at most two decimals, at least 0 and at most 999999.99 - every rule that
 * fails listed, entry by entry in posted order. A key that is no member id
 * reads as id 0, as PHP's `(int)` does, and so is no member of any league.
 */
export function paymentsFormEntry(posted: PaymentsPosted): PaymentsFormCheck {
  const checked = postedEntries(posted);
  if (!('entries' in checked)) return { ok: false, errors: [checked] };
  const prepared = [...checked.entries].map(
    ([key, value]) => [key, preparedText(value)] as const,
  );
  const errors = prepared.flatMap(([key, value]) =>
    isBlank(value) ? [] : amountErrors(key, value),
  );
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: new Map(
      prepared.map(
        ([key, value]) => [memberKey(key), amountOf(value)] as const,
      ),
    ),
  };
}

function memberKey(key: string): number {
  const id = idFromText(key);
  return id.ok ? id.value : 0;
}

function amountOf(value: unknown): Cents | null {
  if (typeof value !== 'string' || value === '') return null;
  const checked = checkAmount(value);
  return checked.ok ? checked.cents : null;
}

/** A posted field of the payment details form. */
export type DetailsField =
  'payment_beneficiary' | 'payment_iban' | 'payment_note';

export type DetailsRule = 'max' | 'iban' | 'pair';

export interface DetailsFieldError {
  readonly field: DetailsField;
  readonly rule: DetailsRule;
  readonly message: string;
}

/** What a valid details form says; the IBAN compact, a blank box null. */
export interface DetailsEntry {
  readonly beneficiary: string | null;
  readonly iban: string | null;
  readonly note: string | null;
}

export type DetailsFormCheck =
  | { readonly ok: true; readonly value: DetailsEntry }
  | { readonly ok: false; readonly errors: readonly DetailsFieldError[] };

export const IBAN_CHECKSUM_MESSAGE =
  'Neteisingas IBAN - patikrinkite, ar nesuklydote skaitmeniu.';
export const DETAILS_PAIR_MESSAGE =
  'Nurodykite ir gavėją, ir sąskaitą - su viena iš jų rekvizitai nerodomi.';

const blankToNull = (text: string): string | null =>
  text === '' ? null : text;

/** `max:limit` on a string, in characters (mb_strlen). */
function tooLong(
  field: DetailsField,
  text: string | null,
  limit: number,
): DetailsFieldError[] {
  if (text === null || Array.from(text).length <= limit) return [];
  const name = field.replace('_', ' ');
  return [
    {
      field,
      rule: 'max',
      message: `The ${name} field must not be greater than ${String(limit)} characters.`,
    },
  ];
}

/** The two rules no field rule expresses: the checksum, then both or neither. */
function pairErrors(entry: DetailsEntry): DetailsFieldError[] {
  if (entry.iban !== null && !isValidIban(entry.iban)) {
    return [
      { field: 'payment_iban', rule: 'iban', message: IBAN_CHECKSUM_MESSAGE },
    ];
  }
  if ((entry.beneficiary === null) !== (entry.iban === null)) {
    return [
      { field: 'payment_iban', rule: 'pair', message: DETAILS_PAIR_MESSAGE },
    ];
  }
  return [];
}

/**
 * UpdateLeaguePaymentDetailsRequest on the three posted boxes: trimmed, a
 * blank one null, the IBAN made compact before it is checked; then
 * `max:70`, `max:34` (the compact form) and `max:500`, every one that fails
 * listed; only when none did, the IBAN's checksum, then both-or-neither
 * (reported on the IBAN). The value keeps the compact IBAN.
 */
export function paymentDetailsFormEntry(
  posted: Readonly<Partial<Record<DetailsField, string | null>>>,
): DetailsFormCheck {
  const entry: DetailsEntry = {
    beneficiary: blankToNull(phpTrim(posted.payment_beneficiary ?? '')),
    iban: blankToNull(ibanCompact(phpTrim(posted.payment_iban ?? ''))),
    note: blankToNull(phpTrim(posted.payment_note ?? '')),
  };
  const errors = [
    ...tooLong('payment_beneficiary', entry.beneficiary, 70),
    ...tooLong('payment_iban', entry.iban, 34),
    ...tooLong('payment_note', entry.note, 500),
  ];
  const refused = errors.length > 0 ? errors : pairErrors(entry);
  return refused.length > 0
    ? { ok: false, errors: refused }
    : { ok: true, value: entry };
}
