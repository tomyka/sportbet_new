import { saveStandingsOrder, saveStandingsRow, type Db } from '@sportbet/db';
import {
  reorderFormEntry,
  standingsFormEntry,
  standingsSaveLimits,
  type Instant,
  type PlayerId,
  type ReorderRefusal,
  type Result,
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

/** The refusals both saves share, as sportbet's `{success: false, message}`. */
const SHARED_REFUSALS: Readonly<
  Record<'not-yours' | 'closed', () => StandingsSaveAnswer>
> = {
  'not-yours': () => refusedAnswer(STANDINGS_TEXTS.notThisPrediction),
  closed: () => refusedAnswer(STANDINGS_TEXTS.closed),
};

const ROW_REFUSALS: Readonly<
  Record<StandingsRowRefusal, () => StandingsSaveAnswer>
> = {
  ...SHARED_REFUSALS,
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
};

const ORDER_REFUSALS: Readonly<
  Record<ReorderRefusal, () => StandingsSaveAnswer>
> = {
  ...SHARED_REFUSALS,
  mismatch: () => refusedAnswer(STANDINGS_TEXTS.mismatch),
};

/**
 * What both saves do once their form has passed: the throttle
 * (standingsSaveLimits, the row save and the reorder together; only posts
 * the form passed count), then the save, whose refusal is answered from
 * `refusals`. A lock waited for past 5 s: 503.
 */
async function throttledSave<Refusal extends string>(
  db: Db,
  input: { readonly player: PlayerId; readonly now: Instant },
  save: () => Promise<Result<unknown, Refusal>>,
  refusals: Readonly<Record<Refusal, () => StandingsSaveAnswer>>,
): Promise<StandingsSaveAnswer> {
  const verdict = await throttle(
    db,
    standingsSaveLimits(input.player),
    input.now,
  );
  if (!verdict.allowed) return throttledAnswer(verdict.minutes);
  let saved: Result<unknown, Refusal>;
  try {
    saved = await save();
  } catch (error) {
    if (isLockTimeout(error)) return busyAnswer();
    throw error;
  }
  return saved.ok
    ? { status: 200, body: { success: true } }
    : refusals[saved.refusal]();
}

/**
 * StandingsTable.saveRow's refusal as sportbet answers it: the table's size a
 * 422 on `groupPosition`, a conflict or the chain (R-78) one message under
 * the row's field, "not yours" and "closed" `{success: false, message}`.
 */
export const rowRefusalAnswer = (
  refusal: StandingsRowRefusal,
): StandingsSaveAnswer => ROW_REFUSALS[refusal]();

/**
 * updatePredictionStandingsUser as a use case: the form (Laravel's 422 for
 * every failing field), then saveStandingsRow behind the throttle
 * (throttledSave), whose refusals are sportbet's answers (rowRefusalAnswer).
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
  return throttledSave(
    db,
    input,
    () => saveStandingsRow(db, { player, entry: checked.value, now }),
    ROW_REFUSALS,
  );
}

/**
 * reorderPredictionStandingsUser as a use case: the form (one 422 under
 * `order`), then saveStandingsOrder behind the throttle (throttledSave),
 * whose "not yours", "closed" and "mismatch" are sportbet's
 * `{success: false, message}`.
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
  return throttledSave(
    db,
    input,
    () => saveStandingsOrder(db, { player, order: checked.value, now }),
    ORDER_REFUSALS,
  );
}

/** ReorderPredictionStandingsRequest refused: Laravel's 422 under `order`. */
export const reorderValidationAnswer = (): StandingsSaveAnswer => ({
  status: 422,
  body: validationBody([
    { field: REORDER_ERROR_FIELD, message: STANDINGS_TEXTS.badOrder },
  ]),
});
