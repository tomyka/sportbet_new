/** Laravel's `integer` (FILTER_VALIDATE_INT): an optional sign, no leading zero. */
const LARAVEL_INTEGER = /^[+-]?(?:0|[1-9]\d*)$/u;

/**
 * A posted field as Laravel's `integer` reads it, once TrimStrings has run:
 * the whole number, or null when it is not one (or not a safe integer).
 */
export function laravelInteger(text: string): number | null {
  if (!LARAVEL_INTEGER.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}
