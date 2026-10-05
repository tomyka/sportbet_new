import {
  newTournamentSchema,
  tournamentSchema,
  type NewTournament,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import type { Executor } from '../client';
import { excluded } from '../edge';
import { tournaments } from './schema';

export type { NewTournament };

const columns = {
  id: tournaments.id,
  slug: tournaments.slug,
  name: tournaments.name,
  format: tournaments.format,
  endsOn: tournaments.endsOn,
  standingsDeadlineRound: tournaments.standingsDeadlineRound,
  survival: tournaments.survival,
  standingsTableFinal: tournaments.standingsTableFinal,
};

// Decision 5: rows are parsed at the edge, like any other input.
const tournamentRows = tournamentSchema.array();
const newTournamentRows = newTournamentSchema.array();

export async function listTournaments(db: Executor): Promise<Tournament[]> {
  const rows = await db
    .select(columns)
    .from(tournaments)
    .orderBy(asc(tournaments.name));
  return tournamentRows.parse(rows);
}

export async function findTournamentBySlug(
  db: Executor,
  slug: string,
): Promise<Tournament | undefined> {
  const rows = await db
    .select(columns)
    .from(tournaments)
    .where(eq(tournaments.slug, slug))
    .limit(1);
  return tournamentRows.parse(rows)[0];
}

export async function findTournamentById(
  db: Executor,
  id: number,
): Promise<Tournament | undefined> {
  const rows = await db
    .select(columns)
    .from(tournaments)
    .where(eq(tournaments.id, id))
    .limit(1);
  return tournamentRows.parse(rows)[0];
}

/** Inserts the rows; a slug that already exists is left as it is. */
export async function insertTournaments(
  db: Executor,
  rows: readonly NewTournament[],
): Promise<void> {
  if (rows.length === 0) return;
  // Decision 5: parsed at the edge, like every other boundary.
  const parsed = newTournamentRows.parse(rows);
  await db
    .insert(tournaments)
    .values(parsed)
    .onConflictDoNothing({ target: tournaments.slug });
}

/**
 * Inserts the tournament under its own id, or updates the row with that id
 * (spec 2.2: sportbet's ids are kept, so a saved id is an explicit act).
 */
export async function saveTournament(
  db: Executor,
  tournament: Tournament,
): Promise<void> {
  const row = tournamentSchema.parse(tournament);
  await db
    .insert(tournaments)
    .overridingSystemValue()
    .values(row)
    .onConflictDoUpdate({
      target: tournaments.id,
      set: {
        slug: excluded(tournaments.slug),
        name: excluded(tournaments.name),
        format: excluded(tournaments.format),
        endsOn: excluded(tournaments.endsOn),
        standingsDeadlineRound: excluded(tournaments.standingsDeadlineRound),
        survival: excluded(tournaments.survival),
        standingsTableFinal: excluded(tournaments.standingsTableFinal),
      },
    });
}
