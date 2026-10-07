import { ruledRules } from '@sportbet/domain';
import { at } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { recalculateAll } from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { G7, G8, OTHER, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await saveGames(db, TOURNAMENT, [G7, G8]);
});

describe('recalculateAll (Recalculation::all, R-65)', () => {
  it('recalculates every tournament not frozen, timing each', async () => {
    let tick = 0;
    const done = await recalculateAll(db, {
      now: NOW,
      rules: ruledRules,
      timer: () => (tick += 5),
    });
    expect(done).toEqual([
      { tournament: TOURNAMENT.slug, ms: 5 },
      { tournament: OTHER.slug, ms: 5 },
    ]);
  });

  it('leaves a finished tournament frozen (R-22)', async () => {
    await client.query(
      "update tournaments set ends_on = '2026-10-10' where id = $1",
      [TOURNAMENT.id],
    );
    const done = await recalculateAll(db, {
      now: NOW,
      rules: ruledRules,
      timer: () => 0,
    });
    expect(done.map(({ tournament }) => tournament)).toEqual([OTHER.slug]);
  });
});
