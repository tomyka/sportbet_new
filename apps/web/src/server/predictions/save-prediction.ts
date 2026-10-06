import { savePrediction, type Db } from '@sportbet/db';
import {
  gameId,
  oddsPanel,
  onePlace,
  predictionFormEntry,
  type GameId,
  type Instant,
  type PlayerId,
  type PredictionFieldError,
  type RuleSet,
} from '@sportbet/domain';
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

/** The status and JSON body the route answers with. */
export interface SaveAnswer {
  readonly status: 200 | 422;
  readonly body: Readonly<Record<string, unknown>>;
}

const FIELD_NAMES = { home: 'homeTeamScore', away: 'awayTeamScore' } as const;

const FIELD_MESSAGES = {
  'out-of-range': SAVE_TEXTS.range,
  'half-typed': SAVE_TEXTS.bothScores,
  level: SAVE_TEXTS.draw,
} as const;

/**
 * Laravel's 422 for a failed FormRequest: `errors`, each field's messages
 * under its name, and `message`, the first of them - with "(and N more
 * error[s])" when there are more, in English as Laravel writes it (sportbet
 * translates no such line; its page reads `errors` only).
 */
export function validationAnswer(
  errors: readonly PredictionFieldError[],
): SaveAnswer {
  const listed = errors.map(
    ({ field, problem }) =>
      [FIELD_NAMES[field], FIELD_MESSAGES[problem]] as const,
  );
  const first = listed[0]?.[1] ?? SAVE_TEXTS.range;
  const more = listed.length - 1;
  return {
    status: 422,
    body: {
      message:
        more === 0
          ? first
          : `${first} (and ${String(more)} more ${more === 1 ? 'error' : 'errors'})`,
      errors: Object.fromEntries(listed.map(([name, text]) => [name, [text]])),
    },
  };
}

/** PredictionSaveResponse::refused: 422 `{success: false, message}`. */
const refused = (message: string): SaveAnswer => ({
  status: 422,
  body: { success: false, message },
});

const GAME_ID = /^[1-9]\d{0,9}$/u;

/** A posted id: a whole number from 1, or null. */
function gameField(text: string): GameId | null {
  if (!GAME_ID.test(text)) return null;
  const id = gameId(Number(text));
  return id.ok ? id.value : null;
}

/**
 * updatePredictionResultUser as a use case. The form first, as sportbet's
 * FormRequest runs before its controller (decision 2): a field's refusal
 * is Laravel's 422. Then the ids: `gameID` must be the row's game, else
 * "Šios prognozės išsaugoti negalima." (issue 254; a missing or unreadable
 * id too, decision 7). Then savePrediction, whose "not yours" and
 * "closed" are sportbet's refusals. Accepted: sportbet's
 * `{success, home_odds, draw_odds, away_odds}` - the odds read from the
 * votes now - and the panel as the page prints it (decision 3).
 */
export async function savePredictionFromForm(
  db: Db,
  input: {
    readonly player: PlayerId;
    readonly fields: SaveFields;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<SaveAnswer> {
  const { player, fields, now, rules } = input;
  const checked = predictionFormEntry({ home: fields.home, away: fields.away });
  if (!checked.ok) return validationAnswer(checked.errors);
  const game = gameField(fields.game);
  const row = gameField(fields.row);
  if (game === null || row === null || game !== row) {
    return refused(SAVE_TEXTS.notThisPrediction);
  }
  const saved = await savePrediction(db, {
    player,
    game,
    entry: checked.value,
    now,
    rules,
  });
  if (!saved.ok) {
    switch (saved.refusal) {
      case 'not-yours':
        return refused(SAVE_TEXTS.notThisPrediction);
      case 'closed':
        return refused(SAVE_TEXTS.closed);
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
  const { odds, rate } = saved.value;
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
  };
}
