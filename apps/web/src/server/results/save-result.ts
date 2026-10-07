import type { ResultSaveRefusal } from '@sportbet/db';
import type { ResultField } from '@sportbet/domain';
import {
  RESULT_FIELDS,
  type ResultAnswer,
} from '../../components/admin/result-protocol';
import { throttledText } from '../sign-in/texts';
import { RESULT_TEXTS } from './texts';

const FIELD_NAME: Readonly<
  Record<ResultField, 'homeTeamScore' | 'awayTeamScore'>
> = {
  home: RESULT_FIELDS.home,
  away: RESULT_FIELDS.away,
};

/** Laravel's summary: the first message, and how many more. */
function summary(messages: readonly string[]): string {
  const [first = ''] = messages;
  const more = messages.length - 1;
  if (more === 0) return first;
  return `${first} (and ${String(more)} more error${more === 1 ? '' : 's'})`;
}

/** R-69: too many accepted saves in a minute - 429, with the sign-in throttles' text. */
export function throttledResultAnswer(minutes: number): ResultAnswer {
  return {
    status: 429,
    body: { success: false, message: throttledText(minutes) },
  };
}

/**
 * saveResult's outcome as POST /admin/updateResult answers it: sportbet's
 * 200 `{success: true}`, or Laravel's 422 with each box's message (the
 * game's own refusals on the home box, as UpdateResultRequest adds them).
 * `no-game` is the route's 404.
 */
export function answerOf(
  saved:
    | { readonly ok: true; readonly value: null }
    | {
        readonly ok: false;
        readonly refusal: Exclude<ResultSaveRefusal, { kind: 'no-game' }>;
      },
): ResultAnswer {
  if (saved.ok) return { status: 200, body: { success: true } };
  const refusal = saved.refusal;
  if (refusal.kind === 'fields') {
    const errors: Partial<Record<'homeTeamScore' | 'awayTeamScore', string[]>> =
      {};
    for (const { field, problem } of refusal.errors) {
      const name = FIELD_NAME[field];
      errors[name] = [...(errors[name] ?? []), RESULT_TEXTS.field[problem]];
    }
    return {
      status: 422,
      body: {
        message: summary(
          refusal.errors.map(({ problem }) => RESULT_TEXTS.field[problem]),
        ),
        errors,
      },
    };
  }
  const text =
    refusal.kind === 'not-started'
      ? RESULT_TEXTS.notStarted
      : refusal.kind === 'level'
        ? RESULT_TEXTS.level
        : RESULT_TEXTS.frozen;
  return {
    status: 422,
    body: { message: text, errors: { homeTeamScore: [text] } },
  };
}
