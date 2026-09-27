import {
  tournamentSchema,
  type Format,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../client';
import { tournaments } from './schema';

export interface NewTournament {
  readonly slug: string;
  readonly name: string;
  readonly format: Format;
}

const columns = {
  id: tournaments.id,
  slug: tournaments.slug,
  name: tournaments.name,
  format: tournaments.format,
};

// Decision 5: rows are parsed at the edge, like any other input.
const tournamentRows = tournamentSchema.array();

export async function listTournaments(db: Db): Promise<Tournament[]> {
  const rows = await db
    .select(columns)
    .from(tournaments)
    .orderBy(asc(tournaments.name));
  return tournamentRows.parse(rows);
}

export async function findTournamentBySlug(
  db: Db,
  slug: string,
): Promise<Tournament | undefined> {
  const rows = await db
    .select(columns)
    .from(tournaments)
    .where(eq(tournaments.slug, slug))
    .limit(1);
  return tournamentRows.parse(rows)[0];
}

/** Inserts the rows; a slug that already exists is left as it is. */
export async function insertTournaments(
  db: Db,
  rows: readonly NewTournament[],
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(tournaments)
    .values([...rows])
    .onConflictDoNothing({ target: tournaments.slug });
}
