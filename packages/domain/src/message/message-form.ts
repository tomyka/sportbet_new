import { leagueId, type LeagueId } from '../league/league';
import { MESSAGE_TEXT_MAX, messageTextInvariant } from '../league/invariants';
import { idFromText } from '../shared/ids';
import { laravelInteger } from '../shared/laravel-integer';
import { ok, refuse, type Result } from '../shared/result';

/** A posted field of the message form, by sportbet's name (`MessageController::validateMessage`). */
export type MessageField = 'message' | 'leagueID';

/**
 * Why a field was refused: `required`, `max` on the text (`too-long`),
 * `integer` on the league, and R-95's `league-not-allowed` for a whole number
 * that names no league of the admin's tournament.
 */
export type MessageFieldError =
  | {
      readonly field: MessageField;
      readonly problem: 'required' | 'not-an-integer' | 'league-not-allowed';
    }
  | {
      readonly field: MessageField;
      readonly problem: 'too-long';
      readonly limit: number;
    };

/** What a valid message form says; a null league is a message no dashboard shows. */
export interface MessageEntry {
  readonly text: string;
  readonly league: LeagueId | null;
  readonly active: boolean;
}

export type MessageFormCheck =
  | { readonly ok: true; readonly value: MessageEntry }
  | { readonly ok: false; readonly errors: readonly MessageFieldError[] };

/** The posted fields, trimmed as Laravel's TrimStrings does; a field the post leaves out is `''`. */
export interface MessageFormFields {
  readonly message: string;
  readonly leagueID: string;
  readonly active: string;
}

/** R-95: a message belongs to no league or to a league of the admin's tournament. */
export function messageLeagueAllowed(
  league: LeagueId | null,
  allowed: readonly LeagueId[],
): boolean {
  return league === null || allowed.includes(league);
}

/** `required|string`, and the column's 255 characters (code points, as Postgres counts them). */
function textRead(text: string): MessageFieldError | null {
  if (text === '') return { field: 'message', problem: 'required' };
  return messageTextInvariant.schema.safeParse(text).success
    ? null
    : {
        field: 'message',
        problem: 'too-long',
        limit: MESSAGE_TEXT_MAX,
      };
}

/** `nullable|integer` (PHP's FILTER_VALIDATE_INT), then R-95: the league, or why not. */
function leagueRead(
  text: string,
  allowed: readonly LeagueId[],
): { readonly league: LeagueId | null } | MessageFieldError {
  if (text === '') return { league: null };
  const whole = laravelInteger(text);
  if (whole === null) return { field: 'leagueID', problem: 'not-an-integer' };
  const league = leagueId(whole);
  if (league.ok && messageLeagueAllowed(league.value, allowed)) {
    return { league: league.value };
  }
  return { field: 'leagueID', problem: 'league-not-allowed' };
}

const isError = (
  read: { readonly league: LeagueId | null } | MessageFieldError | null,
): read is MessageFieldError => read !== null && 'field' in read;

/**
 * MessageController's insertMessage and updateMessage on the trimmed
 * fields: `message` required and at most 255 characters, `leagueID` blank
 * or an integer that is one of `allowed` (R-95: the admin's tournament's
 * leagues); every failing field listed, in sportbet's order. `active` is on
 * only when posted as exactly `on` (sportbet's `== 'on'`).
 */
export function messageFormEntry(
  fields: MessageFormFields,
  allowed: readonly LeagueId[],
): MessageFormCheck {
  const text = textRead(fields.message);
  const league = leagueRead(fields.leagueID, allowed);
  if (text !== null || isError(league)) {
    return { ok: false, errors: [text, league].filter(isError) };
  }
  return {
    ok: true,
    value: {
      text: fields.message,
      league: league.league,
      active: fields.active === 'on',
    },
  };
}

/**
 * The posted `messageID` (`required|integer`, checked before the form's
 * other fields, so its refusal stands alone), read only by idFromText: an
 * array or a cast never reaches the lookup (issue 281).
 */
export function messageIdEntry(
  text: string,
): Result<number, 'required' | 'not-an-integer'> {
  if (text === '') return refuse('required');
  const id = idFromText(text);
  return id.ok ? ok(id.value) : refuse('not-an-integer');
}
