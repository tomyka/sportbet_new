import { LEAGUE_FEE_MAX, leagueFeeInvariant } from './invariants';

/** A posted field of the league form (LeagueController's create and update). */
export type LeagueFormField =
  'name' | 'description' | 'base_fee' | 'penalty_step' | 'reward_description';

/**
 * Why a field was refused, as Laravel's rules name it: `required`,
 * `max` on text (`too-long`), `integer`, `min` and (R-121) a maximum on a
 * fee. One field has at most one problem, the first of its rules that fails.
 * The limit is the rule's own number, for the message's text.
 */
export type LeagueFieldError =
  | {
      readonly field: LeagueFormField;
      readonly problem: 'required' | 'not-an-integer';
    }
  | {
      readonly field: LeagueFormField;
      readonly problem: 'too-long' | 'below-minimum' | 'above-maximum';
      readonly limit: number;
    };

/** What a valid league form says; `reward` is only ever posted on create. */
export interface LeagueEntry {
  readonly name: string;
  readonly description: string | null;
  readonly baseFee: number | null;
  readonly penaltyStep: number | null;
  readonly reward: string | null;
}

export type LeagueFormCheck =
  | { readonly ok: true; readonly value: LeagueEntry }
  | { readonly ok: false; readonly errors: readonly LeagueFieldError[] };

/** LeagueController's `max:100` on the name, in characters (mb_strlen). */
export const LEAGUE_NAME_MAX = 100;
/** `max:500` on the description and the reward (R-121: not the form's 255). */
export const LEAGUE_TEXT_MAX = 500;

/** PHP's FILTER_VALIDATE_INT: an optional sign, no leading zero. */
const PHP_INTEGER = /^[+-]?(?:0|[1-9][0-9]*)$/u;
const PHP_INT_MAX = 9_223_372_036_854_775_807n;

type Posted = Readonly<Record<string, string | null | undefined>>;

/** A posted field after ConvertEmptyStringsToNull: its text, or null. */
function textOf(posted: Posted, field: LeagueFormField): string | null {
  const text = posted[field];
  return text === undefined || text === null || text === '' ? null : text;
}

const characters = (text: string): number => Array.from(text).length;

/** `nullable|string|max:limit`: the text, or the error. */
function optionalText(
  posted: Posted,
  field: LeagueFormField,
  limit: number,
): { text: string | null } | LeagueFieldError {
  const text = textOf(posted, field);
  return text !== null && characters(text) > limit
    ? { field, problem: 'too-long', limit }
    : { text };
}

/** `nullable|integer|min:0` and R-121's maximum: the number, or the error. */
function optionalFee(
  posted: Posted,
  field: LeagueFormField,
): { number: number | null } | LeagueFieldError {
  const text = textOf(posted, field);
  if (text === null) return { number: null };
  if (!PHP_INTEGER.test(text)) return { field, problem: 'not-an-integer' };
  const value = BigInt(text);
  if (value > PHP_INT_MAX) return { field, problem: 'not-an-integer' };
  if (value < leagueFeeInvariant.min) {
    return { field, problem: 'below-minimum', limit: leagueFeeInvariant.min };
  }
  if (value > BigInt(LEAGUE_FEE_MAX)) {
    return { field, problem: 'above-maximum', limit: LEAGUE_FEE_MAX };
  }
  // + 0: "-0" is the integer 0, not minus zero.
  return { number: Number(value) + 0 };
}

const isError = (checked: object): checked is LeagueFieldError =>
  'field' in checked;

/** `required|string|max:100` on the name. */
function requiredName(posted: Posted): { text: string } | LeagueFieldError {
  const text = textOf(posted, 'name');
  if (text === null) return { field: 'name', problem: 'required' };
  return characters(text) > LEAGUE_NAME_MAX
    ? { field: 'name', problem: 'too-long', limit: LEAGUE_NAME_MAX }
    : { text };
}

/**
 * LeagueController create (78) and update (126) on the posted fields, which
 * the caller has trimmed as Laravel's TrimStrings does (a blank field is
 * null, ConvertEmptyStringsToNull; a field the post leaves out is null).
 * Every field is checked and every failure listed, in the form's order, as
 * Laravel reports them. `reward_description` is read on create only: update
 * does not validate it, so it neither fails nor carries over.
 */
export function leagueFormEntry(
  posted: Posted,
  mode: 'create' | 'update',
): LeagueFormCheck {
  const name = requiredName(posted);
  const description = optionalText(posted, 'description', LEAGUE_TEXT_MAX);
  const baseFee = optionalFee(posted, 'base_fee');
  const penaltyStep = optionalFee(posted, 'penalty_step');
  const reward =
    mode === 'create'
      ? optionalText(posted, 'reward_description', LEAGUE_TEXT_MAX)
      : { text: null };
  if (
    isError(name) ||
    isError(description) ||
    isError(baseFee) ||
    isError(penaltyStep) ||
    isError(reward)
  ) {
    return {
      ok: false,
      errors: [name, description, baseFee, penaltyStep, reward].filter(isError),
    };
  }
  return {
    ok: true,
    value: {
      name: name.text,
      description: description.text,
      baseFee: baseFee.number,
      penaltyStep: penaltyStep.number,
      reward: reward.text,
    },
  };
}
