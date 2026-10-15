import type { Role } from '../account/role';
import { mayUnmarkFinalTable } from '../account/role';
import { teamIdFromText, type TeamId } from '../shared/ids';
import { laravelInteger } from '../shared/laravel-integer';
import { ok, refuse, type Result } from '../shared/result';
import { finalPlaceFromText } from './standings-form';
import {
  TeamOutcomes,
  type TeamOutcome,
  type TeamOutcomesRefusal,
} from './team-outcomes';

/** A column of a posted row of the facts form. */
export type StandingsFactsField = 'team' | 'place' | 'finalPlace';

/** Why a row's field was refused. */
export type StandingsFactsProblem =
  'not-an-id' | 'bad-place' | 'bad-final-place';

export interface StandingsFactsError {
  /** The row's index in the posted arrays. */
  readonly row: number;
  readonly field: StandingsFactsField;
  readonly problem: StandingsFactsProblem;
}

/**
 * The facts form as posted (TeamController::updateTeams): the rows' ids,
 * places and final places in parallel arrays, a missing entry read as
 * blank; the stage ticks as the set of row indexes ticked (sportbet's
 * `isset($last16[$i])`: an unticked box is absent); the "final" mark.
 * Text is trimmed (TrimStrings has run).
 */
export interface StandingsFactsFields {
  readonly teamID: readonly string[];
  readonly place: readonly string[];
  readonly finalPlace: readonly string[];
  /** A Euroleague play-off tick (sportbet's `quarterfinal`). */
  readonly playOffs: ReadonlySet<number>;
  /** A Euroleague Final Four tick (sportbet's `semifinal`). */
  readonly finalFour: ReadonlySet<number>;
  readonly final: boolean;
}

/** The posted rows, each a team's outcome as entered, and whether the table is marked final. */
export interface StandingsFactsEntry {
  readonly rows: readonly TeamOutcome[];
  readonly final: boolean;
}

export type StandingsFactsCheck =
  | { readonly ok: true; readonly value: StandingsFactsEntry }
  | { readonly ok: false; readonly errors: readonly StandingsFactsError[] };

/** A posted place: blank is none, else a whole number from 1 (outcomePlaceInvariant). */
function placeOf(text: string): Result<number | null, 'bad-place'> {
  if (text === '') return ok(null);
  const value = laravelInteger(text);
  return value !== null && value >= 1 ? ok(value) : refuse('bad-place');
}

type RowRead =
  | { readonly ok: true; readonly value: TeamOutcome }
  | { readonly ok: false; readonly errors: readonly StandingsFactsError[] };

function rowOf(fields: StandingsFactsFields, row: number): RowRead {
  const team = teamIdFromText(fields.teamID[row] ?? '');
  const place = placeOf(fields.place[row] ?? '');
  const finalPlace = finalPlaceFromText(fields.finalPlace[row] ?? '');
  if (team.ok && place.ok && finalPlace.ok) {
    return {
      ok: true,
      value: {
        team: team.value,
        place: place.value,
        playOffs: fields.playOffs.has(row),
        finalFour: fields.finalFour.has(row),
        finalPlace: finalPlace.value,
      },
    };
  }
  const errors: StandingsFactsError[] = [];
  if (!team.ok) errors.push({ row, field: 'team', problem: 'not-an-id' });
  if (!place.ok) errors.push({ row, field: 'place', problem: place.refusal });
  if (!finalPlace.ok) {
    errors.push({ row, field: 'finalPlace', problem: finalPlace.refusal });
  }
  return { ok: false, errors };
}

/**
 * The facts form's rows, every failing field of every row listed (Laravel
 * reports each), row by row: `teamID.*` an integer, the place blank or a
 * whole number from 1, the final place blank, 1 or 2 (a Euroleague final's
 * champion and runner-up). Whether the teams are the tournament's, or the
 * places differ, is enterStandingsFacts's.
 */
export function standingsFactsEntry(
  fields: StandingsFactsFields,
): StandingsFactsCheck {
  const reads = Array.from({ length: fields.teamID.length }, (_, row) =>
    rowOf(fields, row),
  );
  const errors = reads.flatMap((read) => (read.ok ? [] : read.errors));
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      rows: reads.flatMap((read) => (read.ok ? [read.value] : [])),
      final: fields.final,
    },
  };
}

export type FinalMarkRefusal = 'places-incomplete' | 'unmark-not-allowed';

/** R-92: every place from 1 to N held, once each (a team without one, a gap or a place past N fails). */
function placesComplete(outcomes: TeamOutcomes, teamCount: number): boolean {
  const places = outcomes.teams.map(({ place }) => place);
  return (
    outcomes.teams.length === teamCount &&
    [...places]
      .sort((a, b) => (a ?? 0) - (b ?? 0))
      .every((place, index) => place === index + 1)
  );
}

/**
 * R-92 and R-43: the mark the table stands with. "Final" is accepted only
 * with every team holding a place and the places exactly 1..N (N the
 * tournament's teams), whether newly marked or staying so; taking the mark
 * off is a superadmin's (`mayUnmarkFinalTable`). Never marked and left so,
 * a table needs nothing.
 */
export function finalMark(input: {
  readonly outcomes: TeamOutcomes;
  readonly teamCount: number;
  readonly wasFinal: boolean;
  readonly final: boolean;
  readonly role: Role;
}): Result<boolean, FinalMarkRefusal> {
  if (input.final) {
    return placesComplete(input.outcomes, input.teamCount)
      ? ok(true)
      : refuse('places-incomplete');
  }
  return input.wasFinal && !mayUnmarkFinalTable(input.role)
    ? refuse('unmark-not-allowed')
    : ok(false);
}

export type StandingsFactsRefusal =
  | 'tournament-finished'
  | 'unknown-team'
  | TeamOutcomesRefusal
  | FinalMarkRefusal;

/** A team of the tournament with nothing entered. */
function blankOutcome(team: TeamId): TeamOutcome {
  return {
    team,
    place: null,
    playOffs: false,
    finalFour: false,
    finalPlace: null,
  };
}

/**
 * The tournament's outcomes after the admin's rows: a posted team's row
 * replaces its outcome, every other team keeps its own (or none yet);
 * refused when the tournament is finished (R-110), a posted team is not the
 * tournament's `teams`, is posted twice, or the rows break TeamOutcomes.enter
 * (a place or a final place held by two teams); then the mark (finalMark)
 * decides, so R-37's recalculation follows only a table that stands.
 */
export function enterStandingsFacts(
  current: TeamOutcomes,
  teams: readonly TeamId[],
  entry: StandingsFactsEntry,
  context: { readonly role: Role; readonly finished: boolean },
): Result<TeamOutcomes, StandingsFactsRefusal> {
  if (context.finished) return refuse('tournament-finished');
  if (entry.rows.some((row) => !teams.includes(row.team))) {
    return refuse('unknown-team');
  }
  if (new Set(entry.rows.map((row) => row.team)).size !== entry.rows.length) {
    return refuse('duplicate-team');
  }
  const merged = teams.map(
    (team) =>
      entry.rows.find((row) => row.team === team) ??
      current.outcomeOf(team) ??
      blankOutcome(team),
  );
  const entered = TeamOutcomes.enter(merged, entry.final);
  if (!entered.ok) return entered;
  const mark = finalMark({
    outcomes: entered.value,
    teamCount: teams.length,
    wasFinal: current.tableIsFinal,
    final: entry.final,
    role: context.role,
  });
  return mark.ok ? entered : mark;
}
