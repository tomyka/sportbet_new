import {
  countPointsRows,
  findTournamentBySlug,
  inputReadsOf,
  loadTournamentInputs,
  loadTournamentPoints,
  type Db,
} from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { sportbetRules } from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadMapped, recalculateLoaded } from '../src/load';
import { mapSportbet } from '../src/map';
import { readRows, syntheticDump } from './fixtures/sportbet-dump';

const { db, client } = useTestDatabase();

const mapped = () => mapSportbet(readRows(syntheticDump()));

/** Every table's row count, and the golden tournament's rows as the domain reads them. */
async function everything(database: Db) {
  const tables = z
    .array(z.object({ name: z.string() }))
    .parse(
      (
        await client.query(
          "select tablename as name from pg_tables where schemaname = 'public' order by tablename",
        )
      ).rows,
    );
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const [row] = z
      .array(z.object({ rows: z.coerce.number() }))
      .parse(
        (await client.query(`select count(*) as rows from "${name}"`)).rows,
      );
    counts[name] = row?.rows ?? 0;
  }
  const tournament = await findTournamentBySlug(database, 'golden-el');
  if (tournament === undefined) throw new Error('golden-el was not loaded');
  return {
    counts,
    inputs: await loadTournamentInputs(
      database,
      tournament,
      inputReadsOf(sportbetRules),
    ),
    production: await loadTournamentPoints(database, tournament, 'production'),
  };
}

describe('the load', () => {
  it('leaves the same rows when the same mapped rows are loaded twice', async () => {
    await loadMapped(db, mapped());
    const once = await everything(db);
    await loadMapped(db, mapped());
    expect(await everything(db)).toEqual(once);
    expect(once.counts).toMatchObject({
      tournaments: 1,
      players: 4,
      games: 4,
      match_predictions: 10,
      survival_picks: 5,
    });
  });

  it('leaves one set of rows per source when the tournament is recalculated twice', async () => {
    await loadMapped(db, mapped());
    const tournament = await findTournamentBySlug(db, 'golden-el');
    if (tournament === undefined) throw new Error('golden-el was not loaded');
    await recalculateLoaded(db, [tournament]);
    const once = await countPointsRows(db, tournament);
    await recalculateLoaded(db, [tournament]);
    expect(await countPointsRows(db, tournament)).toEqual(once);
    expect(once).toEqual({
      game_odds: { production: 4, sportbet: 3, ruled: 3 },
      match_points: { production: 9, sportbet: 9, ruled: 9 },
      standings_points: { production: 8, sportbet: 8, ruled: 8 },
      survival_points: { production: 5, sportbet: 5, ruled: 5 },
    });
  });
});
