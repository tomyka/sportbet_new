import { Score } from '../score/score';
import { laravelInteger } from '../shared/laravel-integer';

/** A posted box: `homeTeamScore` or `awayTeamScore`. */
export type ResultField = 'home' | 'away';

/** Why a box was refused, in UpdateResultRequest's order. */
export type ResultFieldProblem =
  'not-a-whole-number' | 'above-maximum' | 'negative' | 'half';

export interface ResultFieldError {
  readonly field: ResultField;
  readonly problem: ResultFieldProblem;
}

/** What the admin entered: a score, the postponed placeholder (R-63), or nothing (a clear). */
export type ResultEntry =
  | { readonly kind: 'score'; readonly score: Score }
  | { readonly kind: 'postpone' }
  | { readonly kind: 'clear' };

/** The entry, or every box's refusal (Laravel reports each field). */
export type ResultFormCheck =
  | { readonly ok: true; readonly value: ResultEntry }
  | { readonly ok: false; readonly errors: readonly ResultFieldError[] };

/** sportbet's `max:150`: a column guard, not a sporting one. */
export const RESULT_MAX = 150;

/** One trimmed box: blank, a whole number (Laravel's `integer`), or its problem. */
function boxOf(text: string): number | null | ResultFieldProblem {
  if (text === '') return null;
  const value = laravelInteger(text);
  if (value === null) return 'not-a-whole-number';
  return value > RESULT_MAX ? 'above-maximum' : value;
}

/** Each box's error, home then away, where `problemOf` finds one. */
function boxErrors<T>(
  boxes: Readonly<Record<ResultField, T>>,
  problemOf: (box: T) => ResultFieldProblem | null,
): ResultFieldError[] {
  return (['home', 'away'] as const).flatMap((field) => {
    const problem = problemOf(boxes[field]);
    return problem === null ? [] : [{ field, problem }];
  });
}

/**
 * UpdateResultRequest's after() on two whole-number boxes: -1 : -1 is the
 * postponed placeholder (R-63); any other negative is refused on each
 * negative box; both empty is a clear; one empty is refused on the empty
 * box (R-64); else the score.
 */
function entryOfBoxes(
  home: number | null,
  away: number | null,
): ResultFormCheck {
  if (home === -1 && away === -1) {
    return { ok: true, value: { kind: 'postpone' } };
  }
  const negative = boxErrors({ home, away }, (box) =>
    box !== null && box < 0 ? 'negative' : null,
  );
  if (negative.length > 0) return { ok: false, errors: negative };
  if (home === null && away === null) {
    return { ok: true, value: { kind: 'clear' } };
  }
  if (home === null || away === null) {
    return {
      ok: false,
      errors: [{ field: home === null ? 'home' : 'away', problem: 'half' }],
    };
  }
  const score = Score.of(home, away);
  if (!score.ok) {
    throw new Error('resultFormEntry: a checked pair is not a score');
  }
  return { ok: true, value: { kind: 'score', score: score.value } };
}

/**
 * UpdateResultRequest on the two trimmed boxes: each box's
 * `nullable|integer|max:150` first, every box that fails one error; then
 * after(): -1 : -1 is the postponed placeholder (R-63); any other negative
 * is refused on each negative box; both empty is a clear; one empty is
 * refused on the empty box (R-64; sportbet's server lets it through). The
 * game's own checks (tip-off, level) are enterResult's.
 */
export function resultFormEntry(boxes: {
  readonly home: string;
  readonly away: string;
}): ResultFormCheck {
  const home = boxOf(boxes.home);
  const away = boxOf(boxes.away);
  const typed = boxErrors({ home, away }, (box) =>
    typeof box === 'string' ? box : null,
  );
  if (typed.length > 0) return { ok: false, errors: typed };
  if (typeof home === 'string' || typeof away === 'string') {
    throw new Error('resultFormEntry: a refused box was let through');
  }
  return entryOfBoxes(home, away);
}
