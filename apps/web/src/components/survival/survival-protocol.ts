import { z } from 'zod';
import type { Refusal } from '../save/laravel-save';

// The survival save's wire format (POST /prediction/predictionSurvival/save),
// written once: the route builds its answers from these types and the pick
// grid posts and reads with them, so the two sides cannot drift apart.

/** The posted fields: sportbet's `teamID`, and the shown round's number (sportbet's `eventID`). */
export const SURVIVAL_FIELDS = { team: 'teamID', round: 'round' } as const;

/** What a refused or lost pick says when the server gave no 422 (survival.blade.php's svShowRefusal). */
export const SURVIVAL_NOT_SAVED =
  'Pasirinkimas neišsaugotas. Bandykite dar kartą.';

/** A pick as the grid posts it: the team's id as the page holds it, the round the page shows. */
export interface SurvivalPickRequest {
  readonly team: string;
  readonly round: number;
}

/** The form body of a pick. */
export const survivalPickBody = (pick: SurvivalPickRequest): URLSearchParams =>
  new URLSearchParams({
    [SURVIVAL_FIELDS.team]: pick.team,
    [SURVIVAL_FIELDS.round]: String(pick.round),
  });

/** 200: sportbet's `{success: true}`. */
export const survivalSavedSchema = z.object({ success: z.literal(true) });

/** Every answer the route gives besides a guest's 401 and a cross-site 403. */
export type SurvivalSaveAnswer =
  | {
      readonly status: 200;
      readonly body: z.infer<typeof survivalSavedSchema>;
    }
  /** A form or pick refusal: one message, sportbet's text. */
  | { readonly status: 422; readonly body: Refusal }
  | { readonly status: 429; readonly body: Refusal }
  /** The save waited too long for a lock (lock_timeout): try again. */
  | { readonly status: 503; readonly body: Refusal };
