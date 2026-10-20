import {
  enterStandingsFacts,
  ok,
  placeholderTeams,
  refuse,
  type Instant,
  type PlaceholderTeamsRefusal,
  type Result,
  type Role,
  type StandingsFactsEntry,
  type StandingsFactsRefusal,
  type TeamId,
  type TeamRename,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { databaseClock, type DatabaseClock } from '../clock';
import { BOARD_CHANGED, type BoardEffect } from '../board-effect';
import type { Executor } from '../client';
import { keyOf, teamOf } from '../edge';
import { seedBlankRows } from '../joining/seed-blank-rows';
import { saveTransaction } from '../save-transaction';
import {
  lockStructure,
  readSeason,
  recalculateStructure,
} from '../season/admin';
import { tournaments } from '../tournament/schema';
import { listTeams, loadTeamOutcomes, saveTeamOutcomes } from './repository';
import { teamOutcomes, teams } from './schema';

export type PlaceholderInsertRefusal =
  'no-tournament' | PlaceholderTeamsRefusal;

/** The placeholder teams to insert into `tournament`: the form's posted `teamCount`, trimmed. */
export interface PlaceholderInsert {
  readonly tournament: Tournament;
  readonly teamCount: string;
  readonly now: Instant;
}

/**
 * TeamController::insertTeams in one transaction under the tournament's
 * recalculation lock, waiting at most 5 s for it: the domain decides
 * (placeholderTeams: the count 2 to 64, R-110, only while the tournament
 * has no team), then the teams `team1` ... `teamN`, an empty outcome for
 * each, and a blank standings row for each team of every player of the
 * tournament (seedBlankRows; sportbet seeded only the inserting admin's).
 * Teams with no outcome move no point, so nothing recalculates. Returns the
 * new teams; a refusal writes nothing.
 */
export async function insertPlaceholderTeams(
  db: Executor,
  write: PlaceholderInsert,
  clock: DatabaseClock = databaseClock,
): Promise<
  Result<{ readonly teams: readonly TeamId[] }, PlaceholderInsertRefusal>
> {
  return saveTransaction(
    db,
    async (
      tx,
    ): Promise<
      Result<{ teams: readonly TeamId[] }, PlaceholderInsertRefusal>
    > => {
      const lock = await lockStructure(tx, write.tournament);
      if (lock === null) return refuse('no-tournament');
      const { tournament } = lock;
      const { finished } = await readSeason(tx, lock, write, clock);
      const names = placeholderTeams(write.teamCount, {
        existing: (await listTeams(tx, tournament)).length,
        finished,
      });
      if (!names.ok) return names;
      const inserted = await tx
        .insert(teams)
        .values(
          names.value.map((name) => ({ tournamentId: tournament.id, name })),
        )
        .returning({ id: teams.id });
      const created = inserted.map(({ id }) => teamOf(id));
      await tx.insert(teamOutcomes).values(
        created.map((team) => ({
          teamId: keyOf(team, 'team'),
          place: null,
          playOffs: false,
          finalFour: false,
          finalPlace: null,
        })),
      );
      await seedBlankRows(tx, tournament, { teams: created });
      return ok({ teams: created });
    },
  );
}

/**
 * TeamController::updateTeamDetails: the name of the tournament's team, as
 * the admin typed it. A team of another tournament, or none, is
 * `unknown-team` (issue 273). A rename moves no point, so nothing
 * recalculates and a finished tournament still allows it.
 */
export async function renameTeam(
  db: Executor,
  write: { readonly tournament: Tournament; readonly rename: TeamRename },
): Promise<Result<null, 'unknown-team'>> {
  const saved = await db
    .update(teams)
    .set({ name: write.rename.name })
    .where(
      and(
        eq(teams.id, keyOf(write.rename.team, 'team')),
        eq(teams.tournamentId, write.tournament.id),
      ),
    )
    .returning({ id: teams.id });
  return saved.length === 0 ? refuse('unknown-team') : ok(null);
}

export type StandingsFactsWriteRefusal =
  'no-tournament' | StandingsFactsRefusal;

/** The facts form's rows and mark, checked field by field (standingsFactsEntry), posted by `role`. */
export interface StandingsFactsWrite {
  readonly tournament: Tournament;
  readonly entry: StandingsFactsEntry;
  readonly role: Role;
  readonly now: Instant;
}

/**
 * TeamController::updateTeams in one transaction under the tournament's
 * lock: the tournament's outcomes are read under it and the domain decides
 * (enterStandingsFacts: R-110, the teams are the tournament's, R-92's final
 * mark and who may take it off). The outcomes and the table's final mark
 * (`standings_table_final`) are written, then the tournament recalculated
 * as its row now stands (R-16, R-37: a place, a tick or the
 * mark, taken off, moves every player's standings points at once). A
 * refusal writes nothing.
 */
export async function saveStandingsFacts(
  db: Executor,
  write: StandingsFactsWrite,
  clock: DatabaseClock = databaseClock,
): Promise<Result<BoardEffect, StandingsFactsWriteRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<BoardEffect, StandingsFactsWriteRefusal>> => {
      const lock = await lockStructure(tx, write.tournament);
      if (lock === null) return refuse('no-tournament');
      const { tournament } = lock;
      const { finished } = await readSeason(tx, lock, write, clock);
      const decided = enterStandingsFacts(
        await loadTeamOutcomes(tx, tournament),
        (await listTeams(tx, tournament)).map(({ id }) => id),
        write.entry,
        { role: write.role, finished },
      );
      if (!decided.ok) return decided;
      await saveTeamOutcomes(tx, tournament, decided.value);
      await tx
        .update(tournaments)
        .set({ standingsTableFinal: decided.value.tableIsFinal })
        .where(eq(tournaments.id, tournament.id));
      await recalculateStructure(lock);
      return ok(BOARD_CHANGED);
    },
  );
}
