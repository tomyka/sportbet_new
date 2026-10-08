import { teamIdFromText, type TeamId } from '../shared/ids';
import { laravelInteger } from '../shared/laravel-integer';
import { ok, refuse, type Result } from '../shared/result';
import type { StandingsEntry } from './standings-table';
import {
  isEnteredFinalPlace,
  predictedPlaceInvariant,
  type EnteredFinalPlace,
} from './standings-prediction';

/** A posted row field: teamID, groupPosition, quarterfinal, semifinal, final. */
export type StandingsField =
  'team' | 'place' | 'playOffs' | 'finalFour' | 'finalPlace';

/** Why a field was refused. */
export type StandingsFieldProblem =
  'not-an-id' | 'bad-place' | 'bad-tick' | 'bad-final-place';

export interface StandingsFieldError {
  readonly field: StandingsField;
  readonly problem: StandingsFieldProblem;
}

export type StandingsFormCheck =
  | { readonly ok: true; readonly value: StandingsEntry }
  | { readonly ok: false; readonly errors: readonly StandingsFieldError[] };

/**
 * `nullable|integer` and a stored place's shape (predictedPlaceInvariant:
 * from 0, as a row posts back sportbet's place 0): blank, a place, or
 * refused. Its range - `min:1|max:positionMax` - is predictStandingsRow's,
 * which keeps an unchanged stored place.
 */
function placeOf(text: string): number | null | 'refused' {
  if (text === '') return null;
  const value = laravelInteger(text);
  return value !== null &&
    predictedPlaceInvariant.schema.safeParse(value).success
    ? value
    : 'refused';
}

/**
 * A typed final place as UpdatePredictionStandingRequest reads `final`
 * (`nullable|integer|min:1|max:2`, the Euroleague's two final places) once
 * TrimStrings has run: blank is none, else 1 or 2 by Laravel's integer.
 * The form and the page's final place box both read it here.
 */
export function finalPlaceFromText(
  text: string,
): Result<EnteredFinalPlace | null, 'bad-final-place'> {
  if (text === '') return ok(null);
  const value = laravelInteger(text);
  return value !== null && isEnteredFinalPlace(value)
    ? ok(value)
    : refuse('bad-final-place');
}

function finalPlaceOf(text: string): EnteredFinalPlace | null | 'refused' {
  const place = finalPlaceFromText(text);
  return place.ok ? place.value : 'refused';
}

/** `nullable|integer|min:0|max:1`: blank, unticked, ticked, or refused. */
function tickOf(text: string): boolean | null | 'refused' {
  if (text === '') return null;
  const value = laravelInteger(text);
  return value === 0 ? false : value === 1 ? true : 'refused';
}

/** One field as its rule read it: its value, or its error. */
type FieldRead<V> =
  | { readonly ok: true; readonly value: V }
  | { readonly ok: false; readonly error: StandingsFieldError };

function fieldRead<V>(
  field: StandingsField,
  problem: StandingsFieldProblem,
  value: V | 'refused',
): FieldRead<V> {
  return value === 'refused'
    ? { ok: false, error: { field, problem } }
    : { ok: true, value };
}

type Accepted<R> = Extract<R, { readonly ok: true }>;

const allAccepted = <T extends Record<string, FieldRead<unknown>>>(
  reads: T,
): reads is { [K in keyof T]: Accepted<T[K]> } =>
  Object.values(reads).every((read) => read.ok);

/** `required|integer` on the row's id, read only by teamIdFromText. */
function teamOf(text: string): TeamId | 'refused' {
  const team = teamIdFromText(text);
  return team.ok ? team.value : 'refused';
}

/**
 * UpdatePredictionStandingRequest::rules() on the trimmed fields, every
 * failing field listed (Laravel reports each) in its rules' order:
 * `prediction_standingID` (here `teamID`), `groupPosition`, `final`, then
 * the stages, `quarterfinal` and `semifinal`. The place's range - from
 * 1 to the table's size - is predictStandingsRow's, since it needs the
 * team's tournament and the row's stored place.
 */
export function standingsFormEntry(
  fields: Readonly<Record<StandingsField, string>>,
): StandingsFormCheck {
  // One line per field, in the rules' order: the order errors are listed in.
  const reads = {
    team: fieldRead('team', 'not-an-id', teamOf(fields.team)),
    place: fieldRead('place', 'bad-place', placeOf(fields.place)),
    finalPlace: fieldRead(
      'finalPlace',
      'bad-final-place',
      finalPlaceOf(fields.finalPlace),
    ),
    playOffs: fieldRead('playOffs', 'bad-tick', tickOf(fields.playOffs)),
    finalFour: fieldRead('finalFour', 'bad-tick', tickOf(fields.finalFour)),
  };
  if (!allAccepted(reads)) {
    return {
      ok: false,
      errors: Object.values(reads).flatMap((read) =>
        read.ok ? [] : [read.error],
      ),
    };
  }
  return {
    ok: true,
    value: {
      team: reads.team.value,
      place: reads.place.value,
      playOffs: reads.playOffs.value,
      finalFour: reads.finalFour.value,
      finalPlace: reads.finalPlace.value,
    },
  };
}

export type ReorderFormProblem = 'empty' | 'not-an-id' | 'repeated';

export type ReorderFormCheck = Result<readonly TeamId[], ReorderFormProblem>;

/**
 * ReorderPredictionStandingsRequest: `order` required, at least one, each
 * a team's id (teamIdFromText), all distinct.
 */
export function reorderFormEntry(order: readonly string[]): ReorderFormCheck {
  if (order.length === 0) return refuse('empty');
  const ids: TeamId[] = [];
  for (const text of order) {
    const id = teamIdFromText(text);
    if (!id.ok) return refuse('not-an-id');
    ids.push(id.value);
  }
  if (new Set(ids).size !== ids.length) return refuse('repeated');
  return ok(ids);
}
