import { savePrediction, type Db } from '@sportbet/db';
import { z } from 'zod';
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
  type RuleSet,
} from '@sportbet/domain';
import { throttle } from '../sign-in/throttle';
import {
  SAVE_FIELDS,
  SAVE_NOT_SAVED,
  type FieldErrors,
  type Refusal,
  type SaveAnswer,
} from '../../components/predictions/save-protocol';
import { throttledBody, validationBody } from '../request/laravel-answers';
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
  readonly body: FieldErrors;
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

/** PredictionSaveResponse::refused: 422 `{success: false, message}`. */
export const refusedAnswer = (
  message: string,
): { readonly status: 422; readonly body: Refusal } => ({
  status: 422,
  body: { success: false, message },
});

/** A save that waited past savePrediction's lock_timeout (5 s): 503, try again. */
export const busyAnswer = (): {
  readonly status: 503;
  readonly body: Refusal;
} => ({ status: 503, body: { success: false, message: SAVE_NOT_SAVED } });

/** Postgres' lock_not_available (55P03), as the driver's error carries it in `cause`. */
const lockTimeoutSchema = z.object({
  cause: z.object({ code: z.literal('55P03') }),
});

/** Whether a save failed only because it waited too long for a lock. */
export function isLockTimeout(error: unknown): boolean {
  return lockTimeoutSchema.safeParse(error).success;
}

/** Too many saves: 429, with the sign-in throttles' text. */
export const throttledAnswer = (
  minutes: number,
): { readonly status: 429; readonly body: Refusal } => ({
  status: 429,
  body: throttledBody(minutes),
});

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

/**
 * updatePredictionResultUser as a use case. The form first, as sportbet's
 * FormRequest runs before its controller (decision 2): a field's refusal
 * is Laravel's 422. Then the two ids, parsed only: a missing or unreadable
 * one is "Šios prognozės išsaugoti negalima." (decision 7). What passes
 * both counts against the throttle, 60 saves a minute per player (429).
 * Then savePrediction, which decides whether `gameID` names the row's game
 * (issue 254, predictMatch) and the lock; its "not yours" and "closed" are
 * sportbet's refusals. Accepted: sportbet's `{success, home_odds,
 * draw_odds, away_odds}` - the odds read from the votes now - and the
 * panel as the page prints it (decision 3), and whether the save changed
 * who is listed (a player switched back on, R-57), for the route to expire
 * the caches of derived points.
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
  const { player, fields, now, rules } = input;
  const checked = predictionFormEntry({ home: fields.home, away: fields.away });
  if (!checked.ok) return validationAnswer(checked.errors);
  const game = gameField(fields.game);
  const row = gameField(fields.row);
  if (game === null || row === null) {
    return refusedAnswer(SAVE_TEXTS.notThisPrediction);
  }
  // At most 60 saves a minute per player (predictionSaveLimits), counting
  // only those the form and the ids let through: a typo or a half-typed
  // keystroke never counts. One past the limit writes nothing.
  const verdict = await throttle(db, predictionSaveLimits(player), now);
  if (!verdict.allowed) return throttledAnswer(verdict.minutes);
  let saved: Awaited<ReturnType<typeof savePrediction>>;
  try {
    saved = await savePrediction(db, {
      player,
      game,
      rowGame: row,
      entry: checked.value,
      now,
      rules,
    });
  } catch (error) {
    if (isLockTimeout(error)) return busyAnswer();
    throw error;
  }
  if (!saved.ok) {
    switch (saved.refusal) {
      case 'not-yours':
        return refusedAnswer(SAVE_TEXTS.notThisPrediction);
      case 'closed':
        return refusedAnswer(SAVE_TEXTS.closed);
      // The form has refused each of these already: an impossible state.
      case 'not-a-whole-number':
      case 'out-of-range':
      case 'half-typed':
      case 'level':
        throw new Error(
          `save: the form passed a pair the prediction refuses (${saved.refusal})`,
        );
    }
  }
  const { odds, rate, listingChanged } = saved.value;
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
