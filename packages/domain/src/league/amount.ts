import { cents, type Cents } from './league';

/**
 * The rules an amount box is checked by, in Laravel's order:
 * `numeric|decimal:0,2|min:0|max:999999.99` (UpdateLeaguePaymentsRequest).
 */
export type AmountRule = 'numeric' | 'decimal' | 'min' | 'max';

export type AmountCheck =
  | { readonly ok: true; readonly cents: Cents }
  | { readonly ok: false; readonly failed: readonly AmountRule[] };

/** PHP's `is_numeric` on a trimmed string. */
const NUMERIC = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/u;
/** Laravel's `decimal` rule: sign, digits, a point, and the decimals counted. */
const DECIMAL = /^[+-]?[0-9]*\.?([0-9]*)$/u;
const NUMBER_PARTS = /^([+-]?)([0-9]*)\.?([0-9]*)(?:[eE]([+-]?[0-9]+))?$/u;
/** `max:999999.99`, in cents. */
const MAX_CENTS = 99_999_999n;
/** Laravel refuses a scientific exponent outside this (MathException). */
const EXPONENT_LIMIT = 1000n;
const MAX_LENGTH = 999_999;

/** `hundredths * 10^scale <= 999999.99`, in whole numbers. */
function withinMaximum(hundredths: bigint, scale: bigint): boolean {
  return scale >= 0n
    ? hundredths * 10n ** scale <= MAX_CENTS
    : hundredths <= MAX_CENTS * 10n ** -scale;
}

/** A numeric text as sign, its digits, and the power of ten they are scaled by. */
function numberParts(text: string): {
  negative: boolean;
  digits: bigint;
  shift: bigint;
  scale: bigint;
} {
  const [, sign = '', whole = '', fraction = '', exponent = '0'] =
    NUMBER_PARTS.exec(text) ?? [];
  const shift = BigInt(exponent);
  return {
    negative: sign === '-',
    digits: BigInt(`${whole}${fraction}` || '0'),
    shift,
    scale: shift - BigInt(fraction.length),
  };
}

/** What `min:0` and `max:999999.99` say about a number, exactly. */
function numberWithinLimits(text: string): { min: boolean; max: boolean } {
  const { negative, digits, shift, scale } = numberParts(text);
  if (shift > EXPONENT_LIMIT || shift < -EXPONENT_LIMIT) {
    return { min: false, max: false };
  }
  return {
    min: !negative || digits === 0n,
    max: negative || withinMaximum(digits * 100n, scale),
  };
}

/**
 * A text that is no number is measured by its length in characters, as
 * Laravel's size rules do (so `min:0` always holds, `max` fails past a
 * million characters).
 */
function textWithinLimits(text: string): { min: boolean; max: boolean } {
  return { min: true, max: Array.from(text).length <= MAX_LENGTH };
}

/** The rules a trimmed, comma-to-point amount text fails, in order. */
function failedRules(text: string): AmountRule[] {
  const numeric = NUMERIC.test(text);
  const decimals = DECIMAL.exec(text)?.[1]?.length;
  const limits = numeric ? numberWithinLimits(text) : textWithinLimits(text);
  const checks: readonly (readonly [AmountRule, boolean])[] = [
    ['numeric', numeric],
    ['decimal', numeric && decimals !== undefined && decimals <= 2],
    ['min', limits.min],
    ['max', limits.max],
  ];
  return checks.filter(([, holds]) => !holds).map(([rule]) => rule);
}

/** The cents of a text that passed every rule: a plain amount, two decimals at most. */
function centsOf(text: string): Cents {
  const [whole = '', fraction = ''] = text.replace(/^[+-]/u, '').split('.');
  const value = cents(
    Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0')),
  );
  if (!value.ok) throw new Error(`an accepted amount "${text}" is no cents`);
  return value.value;
}

/**
 * One amount box's text, already trimmed and with its comma made a point
 * (a blank box is "unpaid" and never reaches here): every rule it fails, or
 * its cents. Laravel's rules read `1e2`, `.5`, `5.` and `+5` as numbers; the
 * `decimal` rule refuses the first and accepts the rest, so `.5` is 50 cents.
 */
export function checkAmount(text: string): AmountCheck {
  const failed = failedRules(text);
  return failed.length === 0
    ? { ok: true, cents: centsOf(text) }
    : { ok: false, failed };
}
