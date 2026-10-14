import {
  leagueFormEntry,
  type LeagueEntry,
  type LeagueFieldError,
  type LeagueFormField,
} from '@sportbet/domain';
import { formText } from '../request/form-input';
import { validationBody } from '../request/laravel-answers';

/** The posted form's fields, in sportbet's order. */
const FIELDS: readonly LeagueFormField[] = [
  'name',
  'description',
  'base_fee',
  'penalty_step',
  'reward_description',
];

/** Laravel's attribute name for a field: snake case, underscores as spaces. */
const attributeOf = (field: LeagueFormField): string =>
  field.replaceAll('_', ' ');

/** One field's error in Laravel's English (sportbet translates none of them). */
function messageOf(error: LeagueFieldError): string {
  const subject = `The ${attributeOf(error.field)} field`;
  switch (error.problem) {
    case 'required':
      return `${subject} is required.`;
    case 'not-an-integer':
      return `${subject} must be an integer.`;
    case 'too-long':
      return `${subject} must not be greater than ${String(error.limit)} characters.`;
    case 'below-minimum':
      return `${subject} must be at least ${String(error.limit)}.`;
    case 'above-maximum':
      return `${subject} must not be greater than ${String(error.limit)}.`;
  }
}

/** The league form read: its entry, or the 422 body listing every refused field. */
export type LeagueFormRead =
  | { readonly ok: true; readonly entry: LeagueEntry }
  | {
      readonly ok: false;
      readonly body: ReturnType<typeof validationBody<LeagueFormField>>;
    };

/**
 * LeagueController create and update's `validate()` on a posted form: each
 * field trimmed as TrimStrings does, then leagueFormEntry (every field
 * checked); a refusal is the 422 body of Laravel's JSON answer.
 */
export function readLeagueForm(
  form: FormData,
  mode: 'create' | 'update',
): LeagueFormRead {
  const posted = Object.fromEntries(
    FIELDS.map((field) => [field, formText(form, field)]),
  );
  const checked = leagueFormEntry(posted, mode);
  if (checked.ok) return { ok: true, entry: checked.value };
  return {
    ok: false,
    body: validationBody(
      checked.errors.map((error) => ({
        field: error.field,
        message: messageOf(error),
      })),
    ),
  };
}
