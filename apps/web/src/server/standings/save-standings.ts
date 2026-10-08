import { saveStandingsOrder, saveStandingsRow, type Db } from '@sportbet/db';
import {
  reorderFormEntry,
  standingsFormEntry,
  standingsSaveLimits,
  type Instant,
  type PlayerId,
  type StandingsField,
  type StandingsFieldError,
  type StandingsRowRefusal,
} from '@sportbet/domain';
import {
  REORDER_ERROR_FIELD,
  STANDINGS_FIELDS,
  type StandingsSaveAnswer,
} from '../../components/standings/standings-protocol';
import {
  busyAnswer,
  isLockTimeout,
  refusedAnswer,
  throttledAnswer,
} from '../request/save-answers';
import { validationBody } from '../request/laravel-answers';
import { throttle } from '../sign-in/throttle';
import { STANDINGS_TEXTS } from './texts';

const FIELD_MESSAGES: Readonly<Record<StandingsFieldError['problem'], string>> =
  {
    'not-an-id': STANDINGS_TEXTS.notThisPrediction,
    'bad-place': STANDINGS_TEXTS.placeFromOne,
    'bad-tick': STANDINGS_TEXTS.badTick,
    'bad-final-place': STANDINGS_TEXTS.badFinalPlace,
  };

/** The fields' refusals as Laravel's 422 (validationBody), under sportbet's field names. */
export function standingsValidationAnswer(
  errors: readonly StandingsFieldError[],
): StandingsSaveAnswer {
  return {
    status: 422,
    body: validationBody(
      errors.map(({ field, problem }) => ({
        field: STANDINGS_FIELDS[field],
        message: FIELD_MESSAGES[problem],
      })),
    ),
  };
}

/** One message under one of sportbet's field names: Laravel's 422. */
const fieldAnswer = (
  field: (typeof STANDINGS_FIELDS)[keyof typeof STANDINGS_FIELDS],
  message: string,
): StandingsSaveAnswer => ({
  status: 422,
  body: validationBody([{ field, message }]),
});

/** A conflict or the chain (R-78): under the row's id field, as rowConflicts adds them. */
const conflictAnswer = (message: string): StandingsSaveAnswer =>
  fieldAnswer(STANDINGS_FIELDS.team, message);

const ROW_REFUSALS: Readonly<
  Record<StandingsRowRefusal, () => StandingsSaveAnswer>
> = {
  'not-yours': () => refusedAnswer(STANDINGS_TEXTS.notThisPrediction),
  // The rules' max:positionMax: the table's size is read by the save.
  'place-out-of-table': () =>
    fieldAnswer(STANDINGS_FIELDS.place, STANDINGS_TEXTS.beyondTable),
  'place-taken': () => conflictAnswer(STANDINGS_TEXTS.placeTaken),
  'play-offs-full': () => conflictAnswer(STANDINGS_TEXTS.playOffsFull),
  'final-four-full': () => conflictAnswer(STANDINGS_TEXTS.finalFourFull),
  'final-place-taken': () => conflictAnswer(STANDINGS_TEXTS.finalPlaceTaken),
  'final-four-without-play-offs': () =>
    conflictAnswer(STANDINGS_TEXTS.finalFourWithoutPlayOffs),
  'final-place-without-final-four': () =>
    conflictAnswer(STANDINGS_TEXTS.finalPlaceWithoutFinalFour),
  closed: () => refusedAnswer(STANDINGS_TEXTS.closed),
};

/**
 * predictStandingsRow's refusal as sportbet answers it: the table's size a
 * 422 on `groupPosition`, a conflict or the chain (R-78) one message under
 * the row's field, "not yours" and "closed" `{success: false, message}`.
 */
export const rowRefusalAnswer = (
  refusal: StandingsRowRefusal,
): StandingsSaveAnswer => ROW_REFUSALS[refusal]();

/**
 * updatePredictionStandingsUser as a use case: the form (Laravel's 422 for
 * every failing field), the throttle (standingsSaveLimits; only posts the
 * form passed count), then saveStandingsRow, whose refusals are sportbet's
 * answers (rowRefusalAnswer). A lock waited for past 5 s: 503.
 */
export async function saveStandingsRowFromForm(
  db: Db,
  input: {
    readonly player: PlayerId;
    readonly fields: Readonly<Record<StandingsField, string>>;
    readonly now: Instant;
  },
): Promise<StandingsSaveAnswer> {
  const { player, fields, now } = input;
  const checked = standingsFormEntry(fields);
  if (!checked.ok) return standingsValidationAnswer(checked.errors);
  const verdict = await throttle(db, standingsSaveLimits(player), now);
  if (!verdict.allowed) return throttledAnswer(verdict.minutes);
  let saved: Awaited<ReturnType<typeof saveStandingsRow>>;
  try {
    saved = await saveStandingsRow(db, { player, entry: checked.value, now });
  } catch (error) {
    if (isLockTimeout(error)) return busyAnswer();
    throw error;
  }
  if (saved.ok) return { status: 200, body: { success: true } };
  return rowRefusalAnswer(saved.refusal);
}

/**
 * reorderPredictionStandingsUser as a use case: the form (one 422 under
 * `order`), the throttle, then saveStandingsOrder, whose "not yours",
 * "closed" and "mismatch" are sportbet's `{success: false, message}`. A
 * lock waited for past 5 s: 503.
 */
export async function saveStandingsOrderFromForm(
  db: Db,
  input: {
    readonly player: PlayerId;
    readonly order: readonly string[];
    readonly now: Instant;
  },
): Promise<StandingsSaveAnswer> {
  const { player, now } = input;
  const checked = reorderFormEntry(input.order);
  if (!checked.ok) return reorderValidationAnswer();
  const verdict = await throttle(db, standingsSaveLimits(player), now);
  if (!verdict.allowed) return throttledAnswer(verdict.minutes);
  let saved: Awaited<ReturnType<typeof saveStandingsOrder>>;
  try {
    saved = await saveStandingsOrder(db, { player, order: checked.value, now });
  } catch (error) {
    if (isLockTimeout(error)) return busyAnswer();
    throw error;
  }
  if (saved.ok) return { status: 200, body: { success: true } };
  switch (saved.refusal) {
    case 'not-yours':
      return refusedAnswer(STANDINGS_TEXTS.notThisPrediction);
    case 'closed':
      return refusedAnswer(STANDINGS_TEXTS.closed);
    case 'mismatch':
      return refusedAnswer(STANDINGS_TEXTS.mismatch);
  }
}

/** ReorderPredictionStandingsRequest refused: Laravel's 422 under `order`. */
export const reorderValidationAnswer = (): StandingsSaveAnswer => ({
  status: 422,
  body: validationBody([
    { field: REORDER_ERROR_FIELD, message: STANDINGS_TEXTS.badOrder },
  ]),
});
