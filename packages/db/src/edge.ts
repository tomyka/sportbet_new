import {
  decimalUnits,
  gameId,
  instantFrom,
  playerId,
  teamId,
  tournamentId,
  type GameId,
  type Instant,
  type PlayerId,
  type Result,
  type TeamId,
  type Tournament,
  type TournamentId,
} from '@sportbet/domain';
import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';

/**
 * What a repository does with a stored row the domain refuses: throws,
 * naming the table, the row's key and the refusal. The CHECKs make such a
 * row unreachable in practice, so one is a bug to see, not to hide.
 */
export function stored<T, R extends string>(
  result: Result<T, R>,
  table: string,
  key: string | number,
): T {
  if (!result.ok) {
    throw new Error(
      `${table} ${String(key)}: the domain refuses the stored row (${result.refusal})`,
    );
  }
  return result.value;
}

/** A database id as the domain's text id: its decimal text. */
const databaseId = z
  .string()
  .regex(/^[1-9][0-9]{0,9}$/)
  .transform(Number)
  .pipe(z.int().max(2_147_483_647));

/**
 * The integer key a domain id stands for. A team or player id that is not
 * a database id (a test's 'ZAL') cannot be saved: a programmer error.
 */
export function keyOf(id: string, what: string): number {
  const parsed = databaseId.safeParse(id);
  if (!parsed.success) {
    throw new Error(`${what} ${id} is not a database id`);
  }
  return parsed.data;
}

/**
 * A database id - ours, or sportbet's, which the reader keeps (spec 2.2) -
 * as the domain's id. The domain accepts every positive id, so a refusal is
 * a programmer error: it throws (stored).
 */
export const teamOf = (id: number): TeamId =>
  stored(teamId(String(id)), 'teams', id);
export const playerOf = (id: number): PlayerId =>
  stored(playerId(String(id)), 'players', id);
export const gameOf = (id: number): GameId => stored(gameId(id), 'games', id);
/** A stored tournament as the domain's tournament key (PlayerStatus reads it). */
export const keyOfTournament = (tournament: Tournament): TournamentId =>
  stored(tournamentId(String(tournament.id)), 'tournaments', tournament.id);

/** A `timestamptz` read back as the domain's instant, to the second. */
export function instantOf(date: Date, table: string, key: string): Instant {
  return stored(
    instantFrom(date.toISOString().replace(/\.000Z$/, 'Z')),
    table,
    key,
  );
}

/**
 * A `numeric` column's text as whole units with `places` decimals: exact,
 * and a value with more places than the column is refused (decimalUnits).
 */
export function unitsOf(
  text: string,
  places: number,
  table: string,
  key: string,
): number {
  return stored(decimalUnits(text, places), table, key);
}

/** `excluded.<column>`: the proposed value, in an upsert's update. */
export const excluded = (column: AnyPgColumn): SQL =>
  sql`excluded.${sql.identifier(column.name)}`;

/**
 * Rows written a chunk at a time: one statement may bind at most 65,535
 * parameters, and a season's predictions or points are more than that.
 */
export async function inChunks<T>(
  rows: readonly T[],
  write: (chunk: T[]) => Promise<unknown>,
  size = 1_000,
): Promise<void> {
  for (let start = 0; start < rows.length; start += size) {
    await write(rows.slice(start, start + size));
  }
}
