// markReminded: the player's listed rows get reminded_at, and nothing else
// changes (issue 230).

import { Game } from '@sportbet/domain';
import { at, gameNo, player, roundNo, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearReminded, markReminded, restoreReminded } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  FEN,
  OLY,
  REA,
  rowsOf,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();

const game = (id: number) =>
  unwrap(
    Game.stored({
      id: gameNo(id),
      round: roundNo(1),
      home: ZAL,
      away: id === 20 ? OLY : id === 21 ? REA : FEN,
      tipOff: at('2026-10-10T18:00:00Z'),
      result: null,
      recordedWinner: null,
      lockedSince: null,
      postponed: false,
    }),
  );

beforeEach(async () => {
  await saveWorld(db);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
  await saveGames(db, TOURNAMENT, [game(20), game(21), game(22)]);
  await client.query(
    "insert into match_predictions (player_id, game_id, home, away, origin) select p, g, case when g = 22 then 80 end, case when g = 22 then 70 end, 'real' from unnest(array[1, 2]) p, unnest(array[20, 21, 22]) g",
  );
});

const state = async () =>
  rowsOf(
    await client.query(
      'select player_id, game_id, home, away, origin, reminded_at is not null as reminded from match_predictions order by player_id, game_id',
    ),
  );

describe('markReminded', () => {
  it('marks only the listed rows of that player, and changes nothing else', async () => {
    const before = await state();
    await markReminded(db, { player: ADA, games: [gameNo(20), gameNo(21)] });
    const after = await state();
    expect(after.map(({ reminded }) => reminded)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    const withoutReminded = (rows: typeof before) =>
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([column]) => column !== 'reminded'),
        ),
      );
    expect(withoutReminded(after)).toEqual(withoutReminded(before));
  });

  it("stamps the database's own clock", async () => {
    await markReminded(db, { player: BEN, games: [gameNo(20)] });
    const { rows } = await client.query<{ seconds: number }>(
      'select extract(epoch from now() - reminded_at)::float as seconds from match_predictions where reminded_at is not null',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.seconds).toBeLessThan(5);
  });

  it('does nothing for no games', async () => {
    await markReminded(db, { player: ADA, games: [] });
    expect((await state()).some(({ reminded }) => reminded === true)).toBe(
      false,
    );
  });
});

describe('restoreReminded', () => {
  const remindedAt = async () =>
    rowsOf(
      await client.query(
        "select player_id, game_id, to_char(reminded_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS') as at from match_predictions where reminded_at is not null order by player_id, game_id",
      ),
    );

  it('keeps the moment sportbet reminded, on those rows only', async () => {
    await restoreReminded(db, TOURNAMENT, [
      { player: ADA, game: gameNo(20), at: at('2026-10-09T18:00:00Z') },
      { player: BEN, game: gameNo(22), at: at('2026-10-09T19:30:05Z') },
    ]);
    expect(await remindedAt()).toEqual([
      { player_id: 1, game_id: 20, at: '2026-10-09T18:00:00' },
      { player_id: 2, game_id: 22, at: '2026-10-09T19:30:05' },
    ]);
  });

  it('writes nothing for a row of another tournament or none', async () => {
    await expect(
      restoreReminded(db, TOURNAMENT, [
        { player: ADA, game: gameNo(20), at: at('2026-10-09T18:00:00Z') },
        {
          player: player('99'),
          game: gameNo(21),
          at: at('2026-10-09T18:00:00Z'),
        },
      ]),
    ).rejects.toThrow('restoreReminded');
    expect(await remindedAt()).toEqual([]);
  });

  it('does nothing for no rows', async () => {
    await restoreReminded(db, TOURNAMENT, []);
    expect(await remindedAt()).toEqual([]);
  });
});

describe('clearReminded', () => {
  it("counts every player's reminder of that game as unsent, and no other game's", async () => {
    await markReminded(db, { player: ADA, games: [gameNo(20), gameNo(21)] });
    await markReminded(db, { player: BEN, games: [gameNo(20)] });
    await clearReminded(db, gameNo(20));
    expect(
      (await state())
        .filter(({ reminded }) => reminded === true)
        .map(({ player_id, game_id }) => [player_id, game_id]),
    ).toEqual([[1, 21]]);
  });
});
