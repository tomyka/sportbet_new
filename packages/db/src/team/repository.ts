import { TeamOutcomes, type TeamId, type Tournament } from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { excluded, inChunks, keyOf, stored, teamOf } from '../edge';
import { teamOutcomes, teams } from './schema';

/** A team of a tournament: its id and its name. */
export interface TeamRow {
  readonly id: TeamId;
  readonly name: string;
}

const teamRows = z.array(z.object({ id: z.int(), name: z.string() }));

const outcomeRows = z.array(
  z.object({
    team: z.int(),
    place: z.int().nullable(),
    playOffs: z.boolean(),
    finalFour: z.boolean(),
    // StandingsPrediction's stored final places, as the CHECK allows.
    finalPlace: z.literal([1, 2, 3, 4]).nullable(),
  }),
);

/**
 * Upserts the tournament's teams by id. A team id saved before under
 * another tournament moves to this one, unless a game or a survival pick or
 * points row still names it: their composite foreign keys
 * (tournament_id, team_id) then refuse the move.
 */
export async function saveTeams(
  db: Executor,
  tournament: Tournament,
  saved: readonly TeamRow[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(teams)
      .overridingSystemValue()
      .values(
        chunk.map(({ id, name }) => ({
          id: keyOf(id, 'team'),
          tournamentId: tournament.id,
          name,
        })),
      )
      .onConflictDoUpdate({
        target: teams.id,
        set: {
          tournamentId: excluded(teams.tournamentId),
          name: excluded(teams.name),
        },
      }),
  );
}

/** The tournament's teams, by id. */
export async function listTeams(
  db: Executor,
  tournament: Tournament,
): Promise<TeamRow[]> {
  const rows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.tournamentId, tournament.id))
    .orderBy(asc(teams.id));
  return teamRows.parse(rows).map(({ id, name }) => ({ id: teamOf(id), name }));
}

/**
 * Upserts each team's outcome in the tournament. Whether the table is final
 * is the tournament's (`standingsTableFinal`), saved with it. An outcome
 * for a team that is not one of the tournament's is a programmer error:
 * it throws, and none is saved.
 */
export async function saveTeamOutcomes(
  db: Executor,
  tournament: Tournament,
  outcomes: TeamOutcomes,
): Promise<void> {
  const own = new Set(
    (await listTeams(db, tournament)).map(({ id }) => keyOf(id, 'team')),
  );
  const stray = outcomes.teams.find(
    (outcome) => !own.has(keyOf(outcome.team, 'team')),
  );
  if (stray !== undefined) {
    throw new Error(
      `saveTeamOutcomes: team ${stray.team} is not a team of tournament ${String(tournament.id)}`,
    );
  }
  await inChunks(outcomes.teams, (chunk) =>
    db
      .insert(teamOutcomes)
      .values(
        chunk.map((outcome) => ({
          teamId: keyOf(outcome.team, 'team'),
          place: outcome.place,
          playOffs: outcome.playOffs,
          finalFour: outcome.finalFour,
          finalPlace: outcome.finalPlace,
        })),
      )
      .onConflictDoUpdate({
        target: teamOutcomes.teamId,
        set: {
          place: excluded(teamOutcomes.place),
          playOffs: excluded(teamOutcomes.playOffs),
          finalFour: excluded(teamOutcomes.finalFour),
          finalPlace: excluded(teamOutcomes.finalPlace),
        },
      }),
  );
}

/**
 * The tournament's team outcomes through TeamOutcomes.stored, the table
 * final or not as the tournament records it (R-14).
 */
export async function loadTeamOutcomes(
  db: Executor,
  tournament: Tournament,
): Promise<TeamOutcomes> {
  const rows = await db
    .select({
      team: teamOutcomes.teamId,
      place: teamOutcomes.place,
      playOffs: teamOutcomes.playOffs,
      finalFour: teamOutcomes.finalFour,
      finalPlace: teamOutcomes.finalPlace,
    })
    .from(teamOutcomes)
    .innerJoin(teams, eq(teams.id, teamOutcomes.teamId))
    .where(eq(teams.tournamentId, tournament.id))
    .orderBy(asc(teamOutcomes.teamId));
  return stored(
    TeamOutcomes.stored(
      outcomeRows.parse(rows).map((row) => ({
        team: teamOf(row.team),
        place: row.place,
        playOffs: row.playOffs,
        finalFour: row.finalFour,
        finalPlace: row.finalPlace,
      })),
      tournament.standingsTableFinal,
    ),
    'team_outcomes',
    tournament.id,
  );
}
