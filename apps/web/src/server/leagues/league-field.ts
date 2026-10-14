import { leagueId, idFromText, type LeagueId } from '@sportbet/domain';

/** What the posted `leagueID` is: a league's id, a refusal in Laravel's words, or an integer no league has. */
export type LeagueField =
  | { readonly kind: 'league'; readonly id: LeagueId }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'no-such-league' };

/** Laravel's attribute name for `leagueID` (snake case, underscores as spaces), in its English messages. */
const ATTRIBUTE = 'league i d';

/** PHP's FILTER_VALIDATE_INT: an optional sign, no leading zero, within a 64-bit integer. */
const PHP_INTEGER = /^[+-]?(?:0|[1-9][0-9]*)$/u;
const PHP_INT_MAX = 9_223_372_036_854_775_807n;

const refused = (message: string): LeagueField => ({
  kind: 'refused',
  message,
});

const isPhpInteger = (text: string): boolean =>
  PHP_INTEGER.test(text) &&
  BigInt(text) <= PHP_INT_MAX &&
  BigInt(text) >= -PHP_INT_MAX - 1n;

/**
 * LeagueController::idFrom: `required|integer` on the trimmed post
 * (Laravel's TrimStrings and ConvertEmptyStringsToNull come first), then
 * the id. An integer that is no id (zero, negative, past Postgres'
 * `integer`) names no league, as `firstOrFail` finds none.
 */
export function readLeagueField(
  posted: FormDataEntryValue | null,
): LeagueField {
  const text = typeof posted === 'string' ? posted.trim() : null;
  if (text === '' || posted === null) {
    return refused(`The ${ATTRIBUTE} field is required.`);
  }
  if (text === null || !isPhpInteger(text)) {
    return refused(`The ${ATTRIBUTE} field must be an integer.`);
  }
  const id = idFromText(text.replace(/^\+/u, ''));
  const league = id.ok ? leagueId(id.value) : null;
  return league?.ok === true
    ? { kind: 'league', id: league.value }
    : { kind: 'no-such-league' };
}
