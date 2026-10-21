import {
  insertPlaceholderTeams,
  type PlaceholderInsertRefusal,
  renameTeam,
  saveStandingsFacts,
} from '@sportbet/db';
import { loadAdminTeams } from '@sportbet/db/admin';
import {
  placeholderTeams,
  standingsFactsEntry,
  teamRenameEntry,
  type PlaceholderTeamsRefusal,
  type StandingsFactsCheck,
} from '@sportbet/domain';
import {
  ADMIN_TEAM_INSERT_PATH,
  ADMIN_TEAMS_PATH,
} from '../../components/admin/admin-paths';
import { formText, formTexts } from '../request/form-input';
import { expireBoard } from '../points-changed';
import type { AdminRequest } from './admin-action';
import { invalid, said, type AdminAnswer } from './admin-answer';
import { adminWrite, settle, withWorkingTournament } from './admin-write';

/** The row indexes a tick's checkboxes name: each box's value is its row's index; an unticked box is absent (`isset($last16[$i])`). */
function ticked(form: FormData, name: string): ReadonlySet<number> {
  return new Set(
    formTexts(form, name)
      .map(Number)
      .filter((row) => Number.isInteger(row) && row >= 0),
  );
}

/** TeamController::updateTeams' rows: every team's id, place and final place in parallel arrays, the two ticks and the "final" mark. */
export function readFactsForm(form: FormData): StandingsFactsCheck {
  return standingsFactsEntry({
    teamID: formTexts(form, 'teamID'),
    place: formTexts(form, 'place'),
    finalPlace: formTexts(form, 'finalPlace'),
    playOffs: ticked(form, 'playOffs'),
    finalFour: ticked(form, 'finalFour'),
    final: formText(form, 'final') !== '',
  });
}

/**
 * TeamController::updateTeams, by a role that may enter the standings
 * facts (R-26 amended): the rows checked field by field, then written by
 * saveStandingsFacts under the tournament's lock, which decides R-110, the
 * teams, and R-92's final mark (and who may take it off), and recalculates
 * (R-16, R-37). An incomplete table says how many places it needs.
 */
export async function saveFacts({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  return withWorkingTournament(admin, ADMIN_TEAMS_PATH, async (tournament) => {
    const entry = readFactsForm(form);
    if (!entry.ok) return invalid(ADMIN_TEAMS_PATH, entry.errors);
    return adminWrite(admin, ADMIN_TEAMS_PATH, async ({ db, now }) => {
      const saved = await saveStandingsFacts(db, {
        tournament,
        entry: entry.value,
        role: admin.role,
        now,
      });
      if (saved.ok || saved.refusal !== 'places-incomplete') {
        return settle(saved, ADMIN_TEAMS_PATH, (written) => {
          expireBoard(written);
          return said(ADMIN_TEAMS_PATH, 'teams-updated');
        });
      }
      const { teams } = await loadAdminTeams(db, tournament);
      return said(ADMIN_TEAMS_PATH, saved.refusal, {
        number: Math.max(1, teams.length),
      });
    });
  });
}

type CountProblem = Extract<
  PlaceholderTeamsRefusal,
  'required' | 'not-an-integer' | 'below-minimum' | 'above-maximum'
>;

const COUNT_PROBLEMS: readonly string[] = [
  'required',
  'not-an-integer',
  'below-minimum',
  'above-maximum',
] satisfies CountProblem[];

/** The count's own refusals are the form field's; the others the tournament's. */
const isCountProblem = (
  refusal: PlaceholderInsertRefusal,
): refusal is CountProblem => COUNT_PROBLEMS.includes(refusal);

/** A refused insert: the count as the field's problem, the rest as the message of its own name. */
function insertRefusal(refusal: PlaceholderInsertRefusal): AdminAnswer {
  return isCountProblem(refusal)
    ? invalid(ADMIN_TEAM_INSERT_PATH, [
        { field: 'teamCount', problem: refusal },
      ])
    : said(ADMIN_TEAM_INSERT_PATH, refusal);
}

/**
 * TeamController::insertTeams: the posted `teamCount` checked first (a
 * refused one costs no write), then written by insertPlaceholderTeams
 * under the tournament's lock, which decides R-110 and that the tournament
 * has no team yet, and seeds every player's standings rows.
 */
export async function addPlaceholderTeams({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  return withWorkingTournament(
    admin,
    ADMIN_TEAM_INSERT_PATH,
    async (tournament) => {
      const teamCount = formText(form, 'teamCount');
      const counted = placeholderTeams(teamCount, {
        existing: 0,
        finished: false,
      });
      if (!counted.ok && isCountProblem(counted.refusal)) {
        return insertRefusal(counted.refusal);
      }
      return adminWrite(admin, ADMIN_TEAM_INSERT_PATH, async ({ db, now }) => {
        const inserted = await insertPlaceholderTeams(db, {
          tournament,
          teamCount,
          now,
        });
        if (!inserted.ok) return insertRefusal(inserted.refusal);
        return said(ADMIN_TEAMS_PATH, 'teams-added', {
          number: inserted.value.teams.length,
        });
      });
    },
  );
}

/**
 * TeamController::updateTeamDetails: the team's new name (the group is not
 * carried: a Euroleague table has none), checked, then written by
 * renameTeam, which refuses a team of another tournament (issue 273). A
 * rename moves no point.
 */
export async function renameTeamFromForm({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  return withWorkingTournament(admin, ADMIN_TEAMS_PATH, async (tournament) => {
    const rename = teamRenameEntry({
      teamID: formText(form, 'teamID'),
      teamName: formText(form, 'teamName'),
    });
    if (!rename.ok) return invalid(ADMIN_TEAMS_PATH, rename.errors);
    return adminWrite(admin, ADMIN_TEAMS_PATH, async ({ db }) =>
      settle(
        await renameTeam(db, { tournament, rename: rename.value }),
        ADMIN_TEAMS_PATH,
        () => said(ADMIN_TEAMS_PATH, 'team-renamed'),
      ),
    );
  });
}
