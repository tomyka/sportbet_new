import { saveResult, type Db, type ResultSaveRefusal } from '@sportbet/db';
import {
  resultFormEntry,
  resultSaveLimits,
  type FillInDice,
  type GameId,
  type Instant,
  type PlayerId,
  type ResultField,
  type ResultFieldError,
  type RuleSet,
} from '@sportbet/domain';
import {
  RESULT_FIELDS,
  type ResultAnswer,
} from '../../components/admin/result-protocol';
import { throttledBody, validationBody } from '../request/laravel-answers';
import { throttle } from '../sign-in/throttle';
import { RESULT_TEXTS } from './texts';

const FIELD_NAME: Readonly<
  Record<ResultField, 'homeTeamScore' | 'awayTeamScore'>
> = {
  home: RESULT_FIELDS.home,
  away: RESULT_FIELDS.away,
};

/** sportbet's 200 `{success: true}`. */
export const SAVED_ANSWER: ResultAnswer = {
  status: 200,
  body: { success: true },
};

/** The boxes' refusal (resultFormEntry) as Laravel's 422, each box's message under its name. */
export function fieldsAnswer(
  errors: readonly ResultFieldError[],
): ResultAnswer {
  return {
    status: 422,
    body: validationBody(
      errors.map(({ field, problem }) => ({
        field: FIELD_NAME[field],
        message: RESULT_TEXTS.field[problem],
      })),
    ),
  };
}

const REFUSAL_TEXT: Readonly<
  Record<Exclude<ResultSaveRefusal, 'no-game'>, string>
> = {
  'not-started': RESULT_TEXTS.notStarted,
  level: RESULT_TEXTS.level,
  frozen: RESULT_TEXTS.frozen,
};

/** The game's own refusal as a 422 on the home box, as UpdateResultRequest adds it. */
export function refusalAnswer(
  refusal: Exclude<ResultSaveRefusal, 'no-game'>,
): ResultAnswer {
  return {
    status: 422,
    body: validationBody([
      { field: RESULT_FIELDS.home, message: REFUSAL_TEXT[refusal] },
    ]),
  };
}

/** R-69: too many accepted saves in a minute - 429, with the sign-in throttles' text. */
export function throttledResultAnswer(minutes: number): ResultAnswer {
  return { status: 429, body: throttledBody(minutes) };
}

/** What the result save answers: a 404 for no such game, else the JSON answer. */
export type ResultSaveAnswer =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'answer'; readonly answer: ResultAnswer };

const answer = (given: ResultAnswer): ResultSaveAnswer => ({
  kind: 'answer',
  answer: given,
});

/**
 * ResultController::updateResult as a use case: the boxes checked first
 * (resultFormEntry; a refusal is Laravel's 422), then R-69's 30 accepted
 * saves a minute (429) - so a mistyped box costs nothing - then the
 * result saved in one transaction (saveResult) by `by`, its own refusals
 * on the home box; no such game is a 404, as sportbet's findOrFail.
 */
export async function saveResultFromForm(
  db: Db,
  input: {
    readonly by: PlayerId;
    readonly game: GameId;
    readonly boxes: { readonly home: string; readonly away: string };
    readonly now: Instant;
    readonly rules: RuleSet;
    readonly dice: FillInDice;
  },
): Promise<ResultSaveAnswer> {
  const { by, game, boxes, now, rules, dice } = input;
  const form = resultFormEntry(boxes);
  if (!form.ok) return answer(fieldsAnswer(form.errors));
  const verdict = await throttle(db, resultSaveLimits(by), now);
  if (!verdict.allowed) return answer(throttledResultAnswer(verdict.minutes));
  const saved = await saveResult(db, {
    game,
    entry: form.value,
    now,
    rules,
    dice,
    by,
  });
  if (saved.ok) return answer(SAVED_ANSWER);
  if (saved.refusal === 'no-game') return { kind: 'not-found' };
  return answer(refusalAnswer(saved.refusal));
}
