import { z } from 'zod';

// POST /admin/updateResult's wire format, written once: the route builds
// its answers from these and the results page posts and parses with them.

/** The page's text for a failure that is not an answer - a lost connection, a 500 (lang/lt.json's). */
export const RESULT_NOT_SAVED = 'Neišsaugota';

/** sportbet's field names (results.blade.php's saveResult). */
export const RESULT_FIELDS = {
  game: 'gameID',
  home: 'homeTeamScore',
  away: 'awayTeamScore',
} as const;

export function resultRequestBody(request: {
  readonly game: number;
  readonly home: string;
  readonly away: string;
}): URLSearchParams {
  return new URLSearchParams({
    [RESULT_FIELDS.game]: String(request.game),
    [RESULT_FIELDS.home]: request.home,
    [RESULT_FIELDS.away]: request.away,
  });
}

/** 200: sportbet's `{success: true}`. */
export const resultSavedSchema = z.object({ success: z.literal(true) });

/** 422: Laravel's `{message, errors}` - the boxes' messages, and `message` the first (design decision 11). */
export const resultErrorsSchema = z.object({
  message: z.string(),
  errors: z.partialRecord(
    z.enum([RESULT_FIELDS.home, RESULT_FIELDS.away, RESULT_FIELDS.game]),
    z.array(z.string()),
  ),
});

export type ResultErrors = z.infer<typeof resultErrorsSchema>;

/** Every answer besides a non-admin's 303 and a cross-site 403. */
export type ResultAnswer =
  | { readonly status: 200; readonly body: { readonly success: true } }
  | { readonly status: 422; readonly body: ResultErrors };

/** What the row shows after a save: saved, or the server's message. */
export type ResultOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'refused'; readonly message: string };

/** The answer as the page shows it; anything else (a lost connection, a 500) is `notSaved`. */
export function readResultAnswer(
  status: number,
  body: unknown,
  notSaved: string,
): ResultOutcome {
  if (status === 200 && resultSavedSchema.safeParse(body).success) {
    return { kind: 'saved' };
  }
  if (status === 422) {
    const errors = resultErrorsSchema.safeParse(body);
    if (errors.success)
      return { kind: 'refused', message: errors.data.message };
  }
  return { kind: 'refused', message: notSaved };
}
