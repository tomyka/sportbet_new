import { teamIdFromText, type TeamId } from '../shared/ids';
import { laravelInteger } from '../shared/laravel-integer';
import { ok, refuse, type Result } from '../shared/result';

/**
 * TeamController::insertTeams' bounds (issue 281): 2 is the smallest
 * tournament anybody plays, 64 is larger than any real one - a bound on a
 * single manual insert.
 */
export const PLACEHOLDER_TEAMS_MIN = 2;
export const PLACEHOLDER_TEAMS_MAX = 64;

/** Why the count, or the tournament, refused the placeholders. */
export type PlaceholderTeamsRefusal =
  | 'required'
  | 'not-an-integer'
  | 'below-minimum'
  | 'above-maximum'
  | 'tournament-finished'
  | 'teams-exist';

/** The posted `teamCount` as `required|integer|min:2|max:64` reads it, or its problem. */
function countOf(
  text: string,
): Result<
  number,
  Exclude<PlaceholderTeamsRefusal, 'tournament-finished' | 'teams-exist'>
> {
  if (text === '') return refuse('required');
  const count = laravelInteger(text);
  if (count === null) return refuse('not-an-integer');
  if (count < PLACEHOLDER_TEAMS_MIN) return refuse('below-minimum');
  return count > PLACEHOLDER_TEAMS_MAX ? refuse('above-maximum') : ok(count);
}

/**
 * The names `team1` ... `teamN` of the placeholder teams for the posted
 * (trimmed) `teamCount`. The count is checked first, as the request is; then
 * a finished tournament refuses (R-110), and so does one that has teams
 * already: the insert is for a tournament with none.
 */
export function placeholderTeams(
  teamCount: string,
  context: { readonly existing: number; readonly finished: boolean },
): Result<readonly string[], PlaceholderTeamsRefusal> {
  const count = countOf(teamCount);
  if (!count.ok) return count;
  if (context.finished) return refuse('tournament-finished');
  if (context.existing > 0) return refuse('teams-exist');
  return ok(
    Array.from(
      { length: count.value },
      (_, index) => `team${String(index + 1)}`,
    ),
  );
}

export type TeamRenameField = 'teamID' | 'teamName';

export interface TeamRenameError {
  readonly field: TeamRenameField;
  readonly problem: 'required' | 'not-an-id';
}

export interface TeamRename {
  readonly team: TeamId;
  readonly name: string;
}

export type TeamRenameCheck =
  | { readonly ok: true; readonly value: TeamRename }
  | { readonly ok: false; readonly errors: readonly TeamRenameError[] };

/**
 * updateTeamDetails on the trimmed fields: `teamID` a required integer,
 * `teamName` required (`teams.team` is NOT NULL); every failing field is
 * listed, the id first. A rename moves no point, so a finished tournament
 * still allows it (R-110 refuses only what can move points).
 */
export function teamRenameEntry(fields: {
  readonly teamID: string;
  readonly teamName: string;
}): TeamRenameCheck {
  const errors: TeamRenameError[] = [];
  const id = fields.teamID === '' ? null : teamIdFromText(fields.teamID);
  if (id === null) errors.push({ field: 'teamID', problem: 'required' });
  else if (!id.ok) errors.push({ field: 'teamID', problem: 'not-an-id' });
  if (fields.teamName === '') {
    errors.push({ field: 'teamName', problem: 'required' });
  }
  if (errors.length > 0 || !id?.ok) {
    return { ok: false, errors };
  }
  return { ok: true, value: { team: id.value, name: fields.teamName } };
}
