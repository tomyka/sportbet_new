// seedBlankRows (PredictionRows::seedMissing), the one place blank prediction
// rows are made: each only where missing, for the players, games and teams
// it is told.

import { Game } from '@sportbet/domain';
import { at, gameNo, player, roundNo, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { saveGames } from '../src/season/repository';
import { seedBlankRows } from '../src/joining/seed-blank-rows';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
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
      away: id === 20 ? OLY : REA,
      tipOff: at('2026-12-01T18:00:00Z'),
      result: null,
      recordedWinner: null,
      lockedSince: null,
      postponed: false,
    }),
  );

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [game(20), game(21)]);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
});

const matchRows = async () =>
  rowsOf(
    await client.query(
      'select player_id, game_id, home, away, origin from match_predictions order by player_id, game_id',
    ),
  );

const standingsRows = async () =>
  rowsOf(
    await client.query(
      'select player_id, team_id, place, play_offs, final_four, final_place from standings_predictions order by player_id, team_id',
    ),
  );

describe('seedBlankRows', () => {
  it('seed: every player of the tournament by default, a blank real row per game and team', async () => {
    await db.transaction((tx) =>
      seedBlankRows(tx, TOURNAMENT, { games: [gameNo(20)], teams: [FEN] }),
    );
    expect(await matchRows()).toEqual([
      { player_id: 1, game_id: 20, home: null, away: null, origin: 'real' },
      { player_id: 2, game_id: 20, home: null, away: null, origin: 'real' },
    ]);
    expect(await standingsRows()).toEqual([
      {
        player_id: 1,
        team_id: 14,
        place: null,
        play_offs: null,
        final_four: null,
        final_place: null,
      },
      {
        player_id: 2,
        team_id: 14,
        place: null,
        play_offs: null,
        final_four: null,
        final_place: null,
      },
    ]);
  });

  it('seed: only the players named', async () => {
    await db.transaction((tx) =>
      seedBlankRows(tx, TOURNAMENT, {
        players: [player('2')],
        games: [gameNo(20), gameNo(21)],
      }),
    );
    expect(
      (await matchRows()).map((row) => [row['player_id'], row['game_id']]),
    ).toEqual([
      [2, 20],
      [2, 21],
    ]);
    expect(await standingsRows()).toEqual([]);
  });

  it('seed: a row that exists is left as it is, and a second call writes nothing', async () => {
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 20, 88, 79, 'real')",
    );
    const seed = () =>
      db.transaction((tx) =>
        seedBlankRows(tx, TOURNAMENT, { games: [gameNo(20)], teams: [ZAL] }),
      );
    await seed();
    const once = [await matchRows(), await standingsRows()];
    await seed();
    expect([await matchRows(), await standingsRows()]).toEqual(once);
    expect(once[0]).toContainEqual({
      player_id: 1,
      game_id: 20,
      home: 88,
      away: 79,
      origin: 'real',
    });
  });

  it('seed: nothing named writes nothing', async () => {
    await db.transaction((tx) => seedBlankRows(tx, TOURNAMENT, {}));
    expect(await matchRows()).toEqual([]);
    expect(await standingsRows()).toEqual([]);
  });

  it('seed: a player who is not in the tournament is left out by default', async () => {
    await savePlaying(db, TOURNAMENT, CAI);
    await client.query('delete from tournament_players where player_id = 3');
    await db.transaction((tx) =>
      seedBlankRows(tx, TOURNAMENT, { games: [gameNo(20)] }),
    );
    expect((await matchRows()).map((row) => row['player_id'])).toEqual([1, 2]);
  });
});
