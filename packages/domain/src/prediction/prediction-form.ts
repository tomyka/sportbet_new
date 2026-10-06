import { PREDICTION_MAX, PREDICTION_MIN } from './match-prediction';

/** A posted field: `homeTeamScore` or `awayTeamScore`. */
export type PredictionField = 'home' | 'away';

/** Why a field was refused, in sportbet's words' order (ScoreFormat). */
export type PredictionFieldProblem = 'out-of-range' | 'half-typed' | 'level';

export interface PredictionFieldError {
  readonly field: PredictionField;
  readonly problem: PredictionFieldProblem;
}

/**
 * The pair, or every field's refusal: Laravel reports each field's rule
 * failure, so a refusal is a list rather than one Result string.
 */
export type PredictionFormCheck =
  | {
      readonly ok: true;
      readonly value: {
        readonly home: number | null;
        readonly away: number | null;
      };
    }
  | { readonly ok: false; readonly errors: readonly PredictionFieldError[] };

/** Laravel's `integer` (FILTER_VALIDATE_INT): an optional sign, no leading zero. */
const LARAVEL_INTEGER = /^[+-]?(?:0|[1-9]\d*)$/u;

/** One trimmed field: blank, a score in range, or refused. */
function sideOf(text: string): number | null | 'refused' {
  if (text === '') return null;
  if (!LARAVEL_INTEGER.test(text)) return 'refused';
  const value = Number(text);
  return Number.isSafeInteger(value) &&
    value >= PREDICTION_MIN &&
    value <= PREDICTION_MAX
    ? value
    : 'refused';
}

/**
 * UpdatePredictionResultRequest on the two trimmed fields (TrimStrings has
 * run; an empty one is null, ConvertEmptyStringsToNull): first each field's
 * `nullable|integer|min:50|max:120` - every field that fails, one range
 * error each (ScoreFormat::rangeMessage) - and only when both pass, its
 * after() hook: one side alone is "both scores" on the blank one (R-15),
 * then a level pair is the home field's "no draws".
 */
export function predictionFormEntry(fields: {
  readonly home: string;
  readonly away: string;
}): PredictionFormCheck {
  const home = sideOf(fields.home);
  const away = sideOf(fields.away);
  const ranged: PredictionFieldError[] = [];
  if (home === 'refused')
    ranged.push({ field: 'home', problem: 'out-of-range' });
  if (away === 'refused')
    ranged.push({ field: 'away', problem: 'out-of-range' });
  if (home === 'refused' || away === 'refused') {
    return { ok: false, errors: ranged };
  }
  if ((home === null) !== (away === null)) {
    return {
      ok: false,
      errors: [
        { field: home === null ? 'home' : 'away', problem: 'half-typed' },
      ],
    };
  }
  if (home !== null && home === away) {
    return { ok: false, errors: [{ field: 'home', problem: 'level' }] };
  }
  return { ok: true, value: { home, away } };
}
