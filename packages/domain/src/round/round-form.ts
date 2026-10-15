import { roundNumber, type RoundNumber } from '../shared/ids';
import { laravelInteger } from '../shared/laravel-integer';
import { Rate } from '../score/score';
import { STAGES, type Stage } from './stage';

/** A posted field of the round form, by sportbet's name. */
export type RoundField = 'event' | 'eventDay' | 'stage' | 'rate';

/** Why a field was refused. */
export type RoundFieldProblem =
  | 'required'
  | 'not-an-integer'
  | 'below-minimum'
  | 'above-maximum'
  | 'unknown-stage';

export interface RoundFieldError {
  readonly field: RoundField;
  readonly problem: RoundFieldProblem;
}

/** What the admin entered for a round: its name and everything a Round holds. */
export interface RoundEntry {
  /** sportbet's `events.event`, e.g. "39 turas"; display only. */
  readonly name: string;
  readonly number: RoundNumber;
  readonly stage: Stage;
  readonly rate: Rate;
  readonly survival: boolean;
  readonly knockout: boolean;
}

export type RoundFormCheck =
  | { readonly ok: true; readonly value: RoundEntry }
  | { readonly ok: false; readonly errors: readonly RoundFieldError[] };

/** `rounds.number` is a smallint: a column guard, as sportbet's `max:127` is for the rate. */
export const ROUND_DAY_MAX = 32_767;

/** sportbet's `max:127` (InsertEventRequest). */
export const ROUND_RATE_MAX = 127;

type Read<V> =
  | { readonly ok: true; readonly value: V }
  | { readonly ok: false; readonly error: RoundFieldError };

function refused(field: RoundField, problem: RoundFieldProblem): Read<never> {
  return { ok: false, error: { field, problem } };
}

/** A trimmed whole number from 1 to `max`, or its problem. */
function boundedInteger(
  field: 'eventDay' | 'rate',
  text: string,
  max: number,
): Read<number> {
  if (text === '') return refused(field, 'required');
  const value = laravelInteger(text);
  if (value === null) return refused(field, 'not-an-integer');
  if (value < 1) return refused(field, 'below-minimum');
  return value > max ? refused(field, 'above-maximum') : { ok: true, value };
}

function stageOf(text: string): Read<Stage> {
  const stage = STAGES.find((each) => each === text);
  if (stage !== undefined) return { ok: true, value: stage };
  return refused('stage', text === '' ? 'required' : 'unknown-stage');
}

/**
 * The form's fields as sportbet's requests read them, every failing field
 * listed (Laravel reports each): `event` required (validateNameAndDay),
 * `eventDay` a required integer from 1 (the round number), the stage one
 * of STAGES (R-10), `rate` a required integer from 1 to 127; the two
 * switches are on only when posted as `on` (`== 'on'`). Fields are trimmed
 * (TrimStrings has run); an empty one is absent.
 */
export function roundFormEntry(
  fields: Readonly<Record<RoundField | 'eventSurvival' | 'isKnockout', string>>,
): RoundFormCheck {
  const name: Read<string> =
    fields.event === ''
      ? refused('event', 'required')
      : { ok: true, value: fields.event };
  const day = boundedInteger('eventDay', fields.eventDay, ROUND_DAY_MAX);
  const stage = stageOf(fields.stage);
  const rateValue = boundedInteger('rate', fields.rate, ROUND_RATE_MAX);
  if (!name.ok || !day.ok || !stage.ok || !rateValue.ok) {
    return {
      ok: false,
      errors: [name, day, stage, rateValue].flatMap((read) =>
        read.ok ? [] : [read.error],
      ),
    };
  }
  const number = roundNumber(day.value);
  const rate = Rate.of(rateValue.value);
  if (!number.ok || !rate.ok) {
    throw new Error('roundFormEntry: a checked number is not a round field');
  }
  return {
    ok: true,
    value: {
      name: name.value,
      number: number.value,
      stage: stage.value,
      rate: rate.value,
      survival: fields.eventSurvival === 'on',
      knockout: fields.isKnockout === 'on',
    },
  };
}
