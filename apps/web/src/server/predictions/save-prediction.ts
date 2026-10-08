import { savePrediction, type Db, type PredictionSaved } from '@sportbet/db';
import {
  gameIdFromText,
  oddsPanel,
  onePlace,
  predictionFormEntry,
  predictionSaveLimits,
  type GameId,
  type Instant,
  type PlayerId,
  type PredictionFieldError,
  type PredictionFormCheck,
  type PredictRefusal,
  type RuleSet,
} from '@sportbet/domain';
import { throttle } from '../sign-in/throttle';
import {
  SAVE_FIELDS,
  type SaveAnswer,
} from '../../components/predictions/save-protocol';
import type { FieldErrorsOf } from '../../components/save/laravel-save';
import { validationBody } from '../request/laravel-answers';
import {
  orBusy,
  refusedAnswer,
  throttledAnswer,
} from '../request/save-answers';
import { SAVE_TEXTS } from './texts';

/** The posted fields, trimmed (form-input.ts): sportbet's names. */
export interface SaveFields {
  /** `gameID` */
  readonly game: string;
  /** `prediction_gameID`: the game of the player's row (its key is player and game). */
  readonly row: string;
  /** `homeTeamScore` */
  readonly home: string;
  /** `awayTeamScore` */
  readonly away: string;
}

const FIELD_NAMES = { home: SAVE_FIELDS.home, away: SAVE_FIELDS.away } as const;

const FIELD_MESSAGES = {
  'out-of-range': SAVE_TEXTS.range,
  'half-typed': SAVE_TEXTS.bothScores,
  level: SAVE_TEXTS.draw,
} as const;

/** The form's refusal as Laravel's 422 (validationBody), under sportbet's field names. */
export function validationAnswer(errors: readonly PredictionFieldError[]): {
  readonly status: 422;
  readonly body: FieldErrorsOf<
    typeof SAVE_FIELDS.home | typeof SAVE_FIELDS.away
  >;
} {
  return {
    status: 422,
    body: validationBody(
      errors.map(({ field, problem }) => ({
        field: FIELD_NAMES[field],
        message: FIELD_MESSAGES[problem],
      })),
    ),
  };
}

/** A posted id, read as the domain reads one (gameIdFromText), or null. */
function gameField(text: string): GameId | null {
  const id = gameIdFromText(text);
  return id.ok ? id.value : null;
}

/** A save's answer; an accepted one also says whether it changed who is listed. */
export type PredictionSaveAnswer =
  | Exclude<SaveAnswer, { readonly status: 200 }>
  | (Extract<SaveAnswer, { readonly status: 200 }> & {
      readonly listingChanged: boolean;
    });

/** What the form and the ids let through, or the answer refusing them. */
export type PostedSave =
  | {
      readonly ok: true;
      readonly entry: Extract<PredictionFormCheck, { ok: true }>['value'];
      readonly game: GameId;
      readonly row: GameId;
    }
  | { readonly ok: false; readonly answer: PredictionSaveAnswer };

/**
 * The form first, as sportbet's FormRequest runs before its controller
 * (decision 2): a field's refusal is Laravel's 422. Then the two ids,
 * parsed only: a missing or unreadable one is "Šios prognozės išsaugoti
 * negalima." (decision 7).
 */
export function postedSave(fields: SaveFields): PostedSave {
  const checked = predictionFormEntry({ home: fields.home, away: fields.away });
  if (!checked.ok) {
    return { ok: false, answer: validationAnswer(checked.errors) };
  }
  const game = gameField(fields.game);
  const row = gameField(fields.row);
  if (game === null || row === null) {
    return { ok: false, answer: refusedAnswer(SAVE_TEXTS.notThisPrediction) };
  }
  return { ok: true, entry: checked.value, game, row };
}

/**
 * savePrediction's refusal as sportbet answers it: "not yours" and
 * "closed" its own text; one the form has refused already is an
 * impossible state.
 */
export function predictionRefusalAnswer(
  refusal: PredictRefusal,
): PredictionSaveAnswer {
  switch (refusal) {
    case 'not-yours':
      return refusedAnswer(SAVE_TEXTS.notThisPrediction);
    case 'closed':
      return refusedAnswer(SAVE_TEXTS.closed);
    case 'not-a-whole-number':
    case 'out-of-range':
    case 'half-typed':
    case 'level':
      throw new Error(
        `save: the form passed a pair the prediction refuses (${refusal})`,
      );
  }
}

/**
 * An accepted save: sportbet's `{success, home_odds, draw_odds,
 * away_odds}` - the odds read from the votes now - and the panel as the
 * page prints it (decision 3), and whether the save changed who is listed.
 */
export function savedAnswer(saved: PredictionSaved): PredictionSaveAnswer {
  const { odds, rate, listingChanged } = saved;
  const panel = oddsPanel(odds, rate);
  return {
    status: 200,
    body: {
      success: true,
      home_odds: odds.home.hundredths / 100,
      draw_odds: odds.draw.hundredths / 100,
      away_odds: odds.away.hundredths / 100,
      panel: {
        home: onePlace(panel.home.hundredths),
        away: onePlace(panel.away.hundredths),
        draw: onePlace(panel.draw.hundredths),
      },
    },
    listingChanged,
  };
}

/**
 * updatePredictionResultUser as a use case: the form and the ids
 * (postedSave); what passes both counts against the throttle, 60 saves a
 * minute per player (429) - a typo or a half-typed keystroke never counts,
 * and one past the limit writes nothing. Then savePrediction, which decides
 * whether `gameID` names the row's game (issue 254, predictMatch) and the
 * lock; its refusals are sportbet's (predictionRefusalAnswer). Accepted:
 * savedAnswer - with whether the save changed who is listed (a player
 * switched back on, R-57), for the route to expire the caches of derived
 * points. A lock waited for past 5 s: 503.
 */
export async function savePredictionFromForm(
  db: Db,
  input: {
    readonly player: PlayerId;
    readonly fields: SaveFields;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<PredictionSaveAnswer> {
  const { player, now, rules } = input;
  const posted = postedSave(input.fields);
  if (!posted.ok) return posted.answer;
  const verdict = await throttle(db, predictionSaveLimits(player), now);
  if (!verdict.allowed) return throttledAnswer(verdict.minutes);
  return orBusy(async () => {
    const saved = await savePrediction(db, {
      player,
      game: posted.game,
      rowGame: posted.row,
      entry: posted.entry,
      now,
      rules,
    });
    return saved.ok
      ? savedAnswer(saved.value)
      : predictionRefusalAnswer(saved.refusal);
  });
}
