import {
  postSave,
  refusedMessage,
  SAVE_NOT_SAVED,
  type NotSaved,
} from '../save/laravel-save';
import {
  STANDINGS_REORDER_PATH,
  STANDINGS_SAVE_PATH,
} from '../shell/shell-paths';
import {
  reorderBody,
  standingsFieldErrorsSchema,
  standingsRowBody,
  standingsSavedSchema,
  type StandingsRowRequest,
} from './standings-protocol';

/** What the ladder shows after a post. */
export type StandingsOutcome = { readonly kind: 'saved' } | NotSaved;

/**
 * A standings save's answer as the ladder shows it (R-59), parsed with the
 * standings protocol. Accepted (200): saved. A refusal: its message
 * (refusedMessage). Anything else - a lost connection, a 401, a 500, a
 * body that is not the answer - "not saved".
 */
export function readStandingsAnswer(
  status: number,
  body: unknown,
): StandingsOutcome {
  const failed = { kind: 'refused', message: SAVE_NOT_SAVED } as const;
  if (status === 200) {
    return standingsSavedSchema.safeParse(body).success
      ? { kind: 'saved' }
      : failed;
  }
  const message = refusedMessage(status, body, standingsFieldErrorsSchema);
  return message === null ? failed : { kind: 'refused', message };
}

/** Posts one row as sportbet's ladder does, and reads the answer. */
export const postStandingsRow = (
  row: StandingsRowRequest,
): Promise<StandingsOutcome> =>
  postSave(STANDINGS_SAVE_PATH, standingsRowBody(row), readStandingsAnswer);

/** Posts the whole order, top first, and reads the answer. */
export const postStandingsOrder = (
  order: readonly string[],
): Promise<StandingsOutcome> =>
  postSave(STANDINGS_REORDER_PATH, reorderBody(order), readStandingsAnswer);
