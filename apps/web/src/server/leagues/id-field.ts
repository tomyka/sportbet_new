import {
  idFromText,
  leagueId,
  playerId,
  type LeagueId,
  type PlayerId,
} from '@sportbet/domain';

/** A posted id a league form or URL carries. */
export type IdAttribute =
  'leagueID' | 'inviteID' | 'invitedUserID' | 'memberID';

/** What a posted id is: an id, a refusal in Laravel's words, or an integer no row has. */
export type IdField =
  | { readonly kind: 'id'; readonly id: number }
  | {
      readonly kind: 'refused';
      readonly field: IdAttribute;
      readonly message: string;
    }
  | { readonly kind: 'no-such-row' };

/** Laravel's attribute names (snake case, underscores as spaces), in its English messages. */
const ATTRIBUTE_NAMES: Readonly<Record<IdAttribute, string>> = {
  leagueID: 'league i d',
  inviteID: 'invite i d',
  invitedUserID: 'invited user i d',
  memberID: 'member i d',
};

/** PHP's FILTER_VALIDATE_INT: an optional sign, no leading zero, within a 64-bit integer. */
const PHP_INTEGER = /^[+-]?(?:0|[1-9][0-9]*)$/u;
const PHP_INT_MAX = 9_223_372_036_854_775_807n;

const refused = (field: IdAttribute, problem: string): IdField => ({
  kind: 'refused',
  field,
  message: `The ${ATTRIBUTE_NAMES[field]} field ${problem}.`,
});

const isPhpInteger = (text: string): boolean =>
  PHP_INTEGER.test(text) &&
  BigInt(text) <= PHP_INT_MAX &&
  BigInt(text) >= -PHP_INT_MAX - 1n;

/**
 * LeagueController::idFrom: `required|integer` on the trimmed post
 * (Laravel's TrimStrings and ConvertEmptyStringsToNull come first), then
 * the id. An integer that is no id (zero, negative, past Postgres'
 * `integer`) names no row, as `firstOrFail` finds none.
 */
export function readIdField(
  posted: FormDataEntryValue | null,
  attribute: IdAttribute,
): IdField {
  const text = typeof posted === 'string' ? posted.trim() : null;
  if (text === '' || posted === null) {
    return refused(attribute, 'is required');
  }
  if (text === null || !isPhpInteger(text)) {
    return refused(attribute, 'must be an integer');
  }
  const id = idFromText(text.replace(/^\+/u, ''));
  return id.ok ? { kind: 'id', id: id.value } : { kind: 'no-such-row' };
}

/** A read id as a league's: the reader has checked its range, so another is an impossible state. */
export function asLeague(id: number): LeagueId {
  const league = leagueId(id);
  if (!league.ok) throw new Error(`${String(id)} is no league id`);
  return league.value;
}

/** A read id as a player's. */
export function asPlayer(id: number): PlayerId {
  const player = playerId(String(id));
  if (!player.ok) throw new Error(`${String(id)} is no player id`);
  return player.value;
}
