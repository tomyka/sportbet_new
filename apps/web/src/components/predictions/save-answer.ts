import { PREDICTION_SAVE_PATH } from '../shell/shell-paths';
import {
  fieldErrorsSchema,
  refusalSchema,
  savedSchema,
  saveRequestBody,
} from './save-protocol';

/** The autosave's text for every failure that is not a refusal (lang/lt.json). */
export const NOT_SAVED = 'Spėjimas neišsaugotas. Bandykite dar kartą.';

/** What the row shows after a save. */
export type SaveOutcome =
  | {
      readonly kind: 'saved';
      readonly panel: { readonly home: string; readonly away: string };
    }
  | { readonly kind: 'refused'; readonly message: string };

/**
 * The save's answer as the page shows it (results.blade.php's .done and
 * .fail), parsed with the save protocol. Accepted (200): the new odds
 * panel. A 422: the first field's first error, as sportbet shows it; else
 * the refusal's own message (R-59: sportbet showed NOT_SAVED for "Šio
 * mačo prognozuoti nebegalima." and "Šios prognozės išsaugoti
 * negalima."). A 429: the throttle's text. Anything else - a lost
 * connection, a 401, a 404, a 500, a body that is not the answer - NOT_SAVED.
 */
export function readSaveAnswer(status: number, body: unknown): SaveOutcome {
  const failed = { kind: 'refused', message: NOT_SAVED } as const;
  if (status === 200) {
    const saved = savedSchema.safeParse(body);
    return saved.success
      ? {
          kind: 'saved',
          panel: { home: saved.data.panel.home, away: saved.data.panel.away },
        }
      : failed;
  }
  if (status === 422) {
    const fields = fieldErrorsSchema.safeParse(body);
    if (fields.success) {
      const first = Object.values(fields.data.errors)[0]?.[0];
      return { kind: 'refused', message: first ?? fields.data.message };
    }
  }
  if (status === 422 || status === 429) {
    const refusal = refusalSchema.safeParse(body);
    if (refusal.success) {
      return { kind: 'refused', message: refusal.data.message };
    }
  }
  return failed;
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
      body: saveRequestBody({ game, row: game, home, away }),
    });
    const body: unknown = await response.json().catch(() => null);
    return readSaveAnswer(response.status, body);
  } catch {
    return { kind: 'refused', message: NOT_SAVED };
  }
}
