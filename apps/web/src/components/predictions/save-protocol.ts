import { z } from 'zod';

// The save's wire format (POST /prediction/results/save), written once:
// the route builds its answers from these types and the page's autosave
// posts and parses with them, so the two sides cannot drift apart.

/** The text for a save that did not go through and may be tried again (lang/lt.json). */
export const SAVE_NOT_SAVED = 'Spėjimas neišsaugotas. Bandykite dar kartą.';

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
export const fieldErrorsSchema = z.object({
  message: z.string(),
  errors: z.partialRecord(
    z.enum([SAVE_FIELDS.home, SAVE_FIELDS.away]),
    z.array(z.string()),
  ),
});

/** 422 for a refusal (PredictionSaveResponse::refused), 429 for too many saves, 503 for a save that waited too long. */
export const refusalSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});

export type Saved = z.infer<typeof savedSchema>;
export type FieldErrors = z.infer<typeof fieldErrorsSchema>;
export type Refusal = z.infer<typeof refusalSchema>;

/** Every answer the route gives besides a guest's 401 and a cross-site 403. */
export type SaveAnswer =
  | { readonly status: 200; readonly body: Saved }
  | { readonly status: 422; readonly body: FieldErrors | Refusal }
  | { readonly status: 429; readonly body: Refusal }
  /** The save waited too long for a lock (lock_timeout): try again. */
  | { readonly status: 503; readonly body: Refusal };
