import {
  tournamentProfileSchema,
  type Tournament,
  type TournamentProfile,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { tournaments } from './schema';

const profileRows = z.array(
  z.object({ id: z.int() }).extend(tournamentProfileSchema.shape),
);

/**
 * Writes the tournament's profile (slice 5): the reader's copy of
 * production's, or the staging seed's. The tournament must be stored
 * already: a profile for none is a programmer error.
 */
export async function saveTournamentProfile(
  db: Executor,
  tournament: Tournament,
  profile: TournamentProfile,
): Promise<void> {
  const row = tournamentProfileSchema.parse(profile);
  const saved = await db
    .update(tournaments)
    .set({
      status: row.status,
      startsOn: row.startsOn,
      sport: row.sport,
      description: row.description,
      isPublic: row.isPublic,
    })
    .where(eq(tournaments.id, tournament.id))
    .returning({ id: tournaments.id });
  if (saved.length === 0) {
    throw new Error(
      `saveTournamentProfile: tournament ${String(tournament.id)} is not stored`,
    );
  }
}

/** Every tournament's profile, by id. */
export async function loadTournamentProfiles(
  db: Executor,
): Promise<Map<number, TournamentProfile>> {
  const rows = await db
    .select({
      id: tournaments.id,
      status: tournaments.status,
      startsOn: tournaments.startsOn,
      sport: tournaments.sport,
      description: tournaments.description,
      isPublic: tournaments.isPublic,
    })
    .from(tournaments)
    .orderBy(asc(tournaments.id));
  return new Map(
    profileRows.parse(rows).map(({ id, ...profile }) => [id, profile]),
  );
}
