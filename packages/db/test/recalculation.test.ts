// R-99 across the database: a scored game keeps the odds it was scored with,
// so a recalculation after a player's votes are gone moves nobody's points;
// a game without a stored row is scored from the votes as they stand.

import { type GameId } from '@sportbet/domain';
import { gameNo } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { recalculateInOwnTransaction } from '../src';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, saveGolden } from './golden-world';
import { rowsOf } from './world';

const { db, client } = useTestDatabase();

beforeEach(() => saveGolden(db));

/** The rows of `source` other than `removed`'s, as the database stores them. */
async function rowsOfSource(source: string, removed: number): Promise<string> {
  return JSON.stringify([
    rowsOf(
      await client.query(
        'select to_jsonb(t) j from match_points t where source = $1::points_source and player_id <> $2 order by game_id, player_id',
        [source, removed],
      ),
    ),
    rowsOf(
      await client.query(
        'select to_jsonb(t) j from game_odds t where source = $1::points_source order by game_id',
        [source],
      ),
    ),
  ]);
}

const recalculated = async () => {
  await recalculateInOwnTransaction(db, GOLDEN_EL);
};

describe('R-99: recalculateAndSave keeps the odds a game was scored with', () => {
  it("recalculation: after a player's predictions are deleted every other player's rows and the live game_odds are byte for byte the same", async () => {
    await recalculated();
    const before = await rowsOfSource('ruled', 1);
    expect(before).toContain('"game_id"');
    await client.query('delete from match_predictions where player_id = 1');
    await recalculated();
    expect(await rowsOfSource('ruled', 1)).toBe(before);
  });

  it('recalculation (ruled): a game whose stored odds row is gone is scored from the votes that remain', async () => {
    await recalculated();
    const gone = z0(
      await client.query(
        "select game_id from game_odds where source = 'ruled' order by game_id limit 1",
      ),
    );
    await client.query(
      "delete from game_odds where source = 'ruled' and game_id = $1",
      [gone],
    );
    await client.query(
      'delete from match_predictions where player_id = 1 and game_id = $1',
      [gone],
    );
    await recalculated();
    const afresh = await client.query(
      "select count(*)::int as n from game_odds where source = 'ruled' and game_id = $1",
      [gone],
    );
    expect(rowsOf(afresh)).toEqual([{ n: 1 }]);
  });
});

/** The first column of the first row, as a game id. */
function z0(result: { rows: { game_id: number }[] }): GameId {
  const [row] = result.rows;
  if (row === undefined) throw new Error('no game_odds row');
  return gameNo(row.game_id);
}

describe('recalculateAndSave on an inconsistent database', () => {
  it('recalculation: a prediction of a player who is not in the tournament is an impossible state: it throws, naming the tournament, and the stored rows stay', async () => {
    await recalculated();
    const before = await rowsOfSource('ruled', 0);
    await client.query('delete from tournament_players where player_id = 1');
    await expect(recalculateInOwnTransaction(db, GOLDEN_EL)).rejects.toThrow(
      `tournament ${String(GOLDEN_EL.id)} could not be recalculated (row-of-player-not-in-tournament)`,
    );
    expect(await rowsOfSource('ruled', 0)).toBe(before);
  });
});
