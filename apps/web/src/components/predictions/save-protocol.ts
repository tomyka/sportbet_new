import { z } from 'zod';
import { fieldErrorsSchemaFor, type SaveAnswerOf } from '../save/laravel-save';

// The save's wire format (POST /prediction/results/save), written once:
// the route builds its answers from these types and the page's autosave
// posts and parses with them, so the two sides cannot drift apart. What
// every save shares - the refusal, the answers' shapes - is laravel-save.ts.

/** The posted fields, as sportbet's pages name them. */
export const SAVE_FIELDS = {
  /** `gameID`: the game. */
  game: 'gameID',
  /** `prediction_gameID`: the game of the player's row (its key is player and game). */
  row: 'prediction_gameID',
  home: 'homeTeamScore',
  away: 'awayTeamScore',
} as const;

/** A save as posted: the ids, and the two boxes as typed. */
export interface SaveRequest {
  readonly game: number;
  readonly row: number;
  readonly home: string;
  readonly away: string;
}

/** The form body the autosave posts. */
export function saveRequestBody(request: SaveRequest): URLSearchParams {
  return new URLSearchParams({
    [SAVE_FIELDS.game]: String(request.game),
    [SAVE_FIELDS.row]: String(request.row),
    [SAVE_FIELDS.home]: request.home,
    [SAVE_FIELDS.away]: request.away,
  });
}

/** 200: sportbet's `{success, home_odds, draw_odds, away_odds}`, and the panel as the page prints it (decision 3). */
export const savedSchema = z.object({
  success: z.literal(true),
  home_odds: z.number(),
  draw_odds: z.number(),
  away_odds: z.number(),
  panel: z.object({ home: z.string(), away: z.string(), draw: z.string() }),
});

/** 422 for the fields: Laravel's `errors`, each score field's messages, and `message`, the first. */
export const fieldErrorsSchema = fieldErrorsSchemaFor([
  SAVE_FIELDS.home,
  SAVE_FIELDS.away,
]);

export type Saved = z.infer<typeof savedSchema>;

/** Every answer the route gives besides a guest's 401 and a cross-site 403. */
export type SaveAnswer = SaveAnswerOf<
  Saved,
  typeof SAVE_FIELDS.home | typeof SAVE_FIELDS.away
>;
