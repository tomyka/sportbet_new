import { idFromText } from '../shared/ids';
import { laravelInteger } from '../shared/laravel-integer';
import { ok, refuse, type Result } from '../shared/result';
import {
  isEnteredFinalPlace,
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

/** A row as the form passed it; null is a field posted blank. */
export interface StandingsRowEntry {
  readonly team: number;
  readonly place: number | null;
  readonly playOffs: boolean | null;
  readonly finalFour: boolean | null;
  readonly finalPlace: EnteredFinalPlace | null;
}

export type StandingsFormCheck =
  | { readonly ok: true; readonly value: StandingsRowEntry }
  | { readonly ok: false; readonly errors: readonly StandingsFieldError[] };

/** `nullable|integer|min:1`: blank, a whole number from 1, or refused. */
function placeOf(text: string): number | null | 'refused' {
  if (text === '') return null;
  const value = laravelInteger(text);
  return value !== null && value >= 1 ? value : 'refused';
}

/** `nullable|integer|min:1|max:2` (the Euroleague's two final places). */
function finalPlaceOf(text: string): EnteredFinalPlace | null | 'refused' {
  if (text === '') return null;
  const value = laravelInteger(text);
  return value !== null && isEnteredFinalPlace(value) ? value : 'refused';
}

/** `nullable|integer|min:0|max:1`: blank, unticked, ticked, or refused. */
function tickOf(text: string): boolean | null | 'refused' {
  if (text === '') return null;
  const value = laravelInteger(text);
  return value === 0 ? false : value === 1 ? true : 'refused';
}

/**
 * UpdatePredictionStandingRequest::rules() on the trimmed fields, every
 * failing field listed (Laravel reports each) in its rules' order:
 * `prediction_standingID` (here `teamID`, read by idFromText),
 * `groupPosition`, `final`, then the stages, `quarterfinal` and
 * `semifinal`. The place's upper bound - the table's size - is
 * predictStandingsRow's, since it needs the team's tournament.
 */
export function standingsFormEntry(
  fields: Readonly<Record<StandingsField, string>>,
): StandingsFormCheck {
  const team = idFromText(fields.team);
  const place = placeOf(fields.place);
  const finalPlace = finalPlaceOf(fields.finalPlace);
  const playOffs = tickOf(fields.playOffs);
  const finalFour = tickOf(fields.finalFour);
  const errors: StandingsFieldError[] = [];
  if (!team.ok) errors.push({ field: 'team', problem: 'not-an-id' });
  if (place === 'refused')
    errors.push({ field: 'place', problem: 'bad-place' });
  if (finalPlace === 'refused') {
    errors.push({ field: 'finalPlace', problem: 'bad-final-place' });
  }
  if (playOffs === 'refused') {
    errors.push({ field: 'playOffs', problem: 'bad-tick' });
  }
  if (finalFour === 'refused') {
    errors.push({ field: 'finalFour', problem: 'bad-tick' });
  }
  if (
    !team.ok ||
    place === 'refused' ||
    finalPlace === 'refused' ||
    playOffs === 'refused' ||
    finalFour === 'refused'
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { team: team.value, place, playOffs, finalFour, finalPlace },
  };
}

export type ReorderFormProblem = 'empty' | 'not-an-id' | 'repeated';

export type ReorderFormCheck = Result<readonly number[], ReorderFormProblem>;

/**
 * ReorderPredictionStandingsRequest: `order` required, at least one, each
 * an id (idFromText), all distinct.
 */
export function reorderFormEntry(order: readonly string[]): ReorderFormCheck {
  if (order.length === 0) return refuse('empty');
  const ids: number[] = [];
  for (const text of order) {
    const id = idFromText(text);
    if (!id.ok) return refuse('not-an-id');
    ids.push(id.value);
  }
  if (new Set(ids).size !== ids.length) return refuse('repeated');
  return ok(ids);
}
