import { z } from 'zod';
import { PREDICTION_SAVE_PATH } from '../shell/shell-paths';

/** The autosave's text for every failure that is not a refusal (lang/lt.json). */
export const NOT_SAVED = 'Spėjimas neišsaugotas. Bandykite dar kartą.';

const accepted = z.object({
  success: z.literal(true),
  panel: z.object({ home: z.string(), away: z.string() }),
});

const refused = z.object({
  message: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});

/** What the row shows after a save. */
export type SaveOutcome =
  | {
      readonly kind: 'saved';
      readonly panel: { readonly home: string; readonly away: string };
    }
  | { readonly kind: 'refused'; readonly message: string };

/**
 * The save's answer as the page shows it (results.blade.php's .done and
 * .fail). Accepted (200): the new odds panel. A 422: the first field's
 * first error, as sportbet shows it; else the refusal's own message (R-59:
 * sportbet showed NOT_SAVED for "Šio mačo prognozuoti nebegalima." and
 * "Šios prognozės išsaugoti negalima."). Anything else - a lost
 * connection, a 401, a 404, a 500, a body that is not the answer - NOT_SAVED.
 */
export function readSaveAnswer(status: number, body: unknown): SaveOutcome {
  const failed = { kind: 'refused', message: NOT_SAVED } as const;
  if (status === 200) {
    const answer = accepted.safeParse(body);
    return answer.success
      ? { kind: 'saved', panel: answer.data.panel }
      : failed;
  }
  if (status !== 422) return failed;
  const answer = refused.safeParse(body);
  if (!answer.success) return failed;
  const errors = answer.data.errors ?? {};
  const first = Object.values(errors)[0]?.[0] ?? answer.data.message;
  return first === undefined ? failed : { kind: 'refused', message: first };
}

/**
 * Posts one pair as sportbet's pages do - its field names, `prediction_gameID`
 * the row's game - and reads the answer. A lost connection is NOT_SAVED.
 */
export async function postPrediction(
  game: number,
  home: string,
  away: string,
): Promise<SaveOutcome> {
  try {
    const response = await fetch(PREDICTION_SAVE_PATH, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        gameID: String(game),
        prediction_gameID: String(game),
        homeTeamScore: home,
        awayTeamScore: away,
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    return readSaveAnswer(response.status, body);
  } catch {
    return { kind: 'refused', message: NOT_SAVED };
  }
}
