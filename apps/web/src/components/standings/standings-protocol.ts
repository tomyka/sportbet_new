import type { EnteredFinalPlace } from '@sportbet/domain';
import { z } from 'zod';
import { fieldErrorsSchemaFor, type SaveAnswerOf } from '../save/laravel-save';

// The standings saves' wire format (POST /prediction/standings/save and
// /prediction/standings/reorder), written once: the routes build their
// answers from these types and the ladder posts and parses with them, so
// the two sides cannot drift apart. What every save shares - the refusal,
// the answers' shapes, the reader and the post - is laravel-save.ts.

/** The row save's fields, as sportbet's page names them (teamID for its prediction_standingID). */
export const STANDINGS_FIELDS = {
  team: 'teamID',
  place: 'groupPosition',
  playOffs: 'quarterfinal',
  finalFour: 'semifinal',
  finalPlace: 'final',
} as const;

/** The reorder's field: jQuery's `order[]`. */
export const ORDER_FIELD = 'order[]';

/** The field a refused order's 422 names: Laravel's `order`, without the brackets. */
export const REORDER_ERROR_FIELD = 'order';

/** A row as the ladder posts it: its team's id as the page holds it (TeamId); null is a field sent blank. */
export interface StandingsRowRequest {
  readonly team: string;
  readonly place: number | null;
  readonly playOffs: boolean | null;
  readonly finalFour: boolean | null;
  readonly finalPlace: EnteredFinalPlace | null;
}

const tick = (value: boolean | null): string =>
  value === null ? '' : value ? '1' : '0';

const number = (value: number | null): string =>
  value === null ? '' : String(value);

/** The form body of a row save. */
export function standingsRowBody(row: StandingsRowRequest): URLSearchParams {
  return new URLSearchParams({
    [STANDINGS_FIELDS.team]: row.team,
    [STANDINGS_FIELDS.place]: number(row.place),
    [STANDINGS_FIELDS.playOffs]: tick(row.playOffs),
    [STANDINGS_FIELDS.finalFour]: tick(row.finalFour),
    [STANDINGS_FIELDS.finalPlace]: number(row.finalPlace),
  });
}

/** The form body of a reorder: every team, top first. */
export function reorderBody(order: readonly string[]): URLSearchParams {
  const body = new URLSearchParams();
  for (const team of order) body.append(ORDER_FIELD, team);
  return body;
}

/** The names a 422 lists its messages under: the row's five, and the order's. */
const STANDINGS_ERROR_FIELDS = [
  STANDINGS_FIELDS.team,
  STANDINGS_FIELDS.place,
  STANDINGS_FIELDS.playOffs,
  STANDINGS_FIELDS.finalFour,
  STANDINGS_FIELDS.finalPlace,
  REORDER_ERROR_FIELD,
] as const;

/** 200: sportbet's PredictionSaveResponse::accepted. */
export const standingsSavedSchema = z.object({ success: z.literal(true) });

/** 422 from the field rules or the conflicts, under the row's field names or the order's. */
export const standingsFieldErrorsSchema = fieldErrorsSchemaFor([
  ...STANDINGS_ERROR_FIELDS,
]);

/** Every answer the two routes give besides a guest's 401 and a cross-site 403. */
export type StandingsSaveAnswer = SaveAnswerOf<
  z.infer<typeof standingsSavedSchema>,
  (typeof STANDINGS_ERROR_FIELDS)[number]
>;
