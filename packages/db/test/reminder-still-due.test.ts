// stillDueGames: the re-read just before a player's mail goes out - only the
// games still unanswered, unmarked, without a result and not yet begun.

import { Game } from '@sportbet/domain';
import { at, gameNo, roundNo, score, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { markReminded, stillDueGames } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  FEN,
  OLY,
  REA,
  saveWorld,
  savePlaying,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();

const HOUR_MS = 3_600_000;
const inHours = (hours: number) =>
  at(
    new Date(Date.now() + hours * HOUR_MS)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z'),
  );

const PAIRS = [
  { home: ZAL, away: OLY },
  { home: ZAL, away: REA },
  { home: ZAL, away: FEN },
  { home: OLY, away: REA },
] as const;

const game = (id: number, hours: number, withResult = false) =>
  unwrap(
    Game.stored({
      id: gameNo(id),
      round: roundNo(1),
      ...(PAIRS[id - 30] ?? PAIRS[0]),
      tipOff: inHours(hours),
      result: withResult ? score(80, 70) : null,
      recordedWinner: null,
      lockedSince: null,
      postponed: false,
    }),
  );

const ALL = [gameNo(30), gameNo(31), gameNo(32), gameNo(33)];

beforeEach(async () => {
  await saveWorld(db);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
  await saveGames(db, TOURNAMENT, [
    game(30, 2),
    game(31, 3),
    game(32, 4, true),
    game(33, -1),
  ]);
  await client.query(
    "insert into match_predictions (player_id, game_id, home, away, origin) select p, g, null, null, 'real' from unnest(array[1, 2]) p, unnest(array[30, 31, 32, 33]) g",
  );
});

describe('stillDueGames', () => {
  it('keeps the games that are unanswered, unmarked, without a result and not begun', async () => {
    expect(
      await stillDueGames(db, { player: ADA, games: [gameNo(30), gameNo(31)] }),
    ).toEqual([gameNo(30), gameNo(31)]);
  });

  it('drops a game with a result and one that has begun', async () => {
    expect(await stillDueGames(db, { player: ADA, games: ALL })).toEqual([
      gameNo(30),
      gameNo(31),
    ]);
  });

  it('drops a game the player answered since, but keeps a half-typed one (unanswered)', async () => {
    await client.query(
      'update match_predictions set home = 80, away = 70 where player_id = 1 and game_id = 30',
    );
    await client.query(
      'update match_predictions set home = 80 where player_id = 1 and game_id = 31',
    );
    expect(await stillDueGames(db, { player: ADA, games: ALL })).toEqual([
      gameNo(31),
    ]);
  });

  it('drops a game already marked reminded, for that player only', async () => {
    await markReminded(db, { player: ADA, games: [gameNo(30)] });
    expect(await stillDueGames(db, { player: ADA, games: ALL })).toEqual([
      gameNo(31),
    ]);
    expect(await stillDueGames(db, { player: BEN, games: ALL })).toEqual([
      gameNo(30),
      gameNo(31),
    ]);
  });

  it('answers none for no games, and for a player with no row', async () => {
    expect(await stillDueGames(db, { player: ADA, games: [] })).toEqual([]);
    await client.query('delete from match_predictions where player_id = 2');
    expect(await stillDueGames(db, { player: BEN, games: ALL })).toEqual([]);
  });
});
