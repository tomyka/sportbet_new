import { Game, ruledRules } from '@sportbet/domain';
import { at, gameNo, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSingleGame } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  CAI,
  G10,
  G7,
  G8,
  G9,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-15T12:00:00Z');

/**
 * The world's game 10, not locked: world.ts locks it after a move
 * (2026-10-03, R-13), and the first case needs an open game.
 */
const G10_OPEN = unwrap(
  Game.stored({
    id: G10.id,
    round: G10.round,
    home: G10.home,
    away: G10.away,
    tipOff: G10.tipOff,
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN]);
  await savePlaying(db, TOURNAMENT, ADA);
  await client.query(
    "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 9, 85, 80, 'real'), (1, 10, null, null, 'real')",
  );
});

const single = (game: number, player = ADA, isAdmin = false) =>
  loadSingleGame(db, {
    viewer: { player, isAdmin },
    game: gameNo(game),
    now: NOW,
    rules: ruledRules,
  });

describe('loadSingleGame (showSingleGame)', () => {
  it("an open game: its teams, tip-off, and the player's row", async () => {
    expect(await single(10)).toMatchObject({
      tournament: { id: TOURNAMENT.id },
      home: 'Real',
      away: 'Olympiacos',
      tipOff: at('2026-10-20T18:00:00Z'),
      locked: false,
      prediction: { home: null, away: null },
    });
  });

  it('a started game is locked, with the row as saved', async () => {
    expect(await single(9)).toMatchObject({
      locked: true,
      prediction: { home: 85, away: 80 },
    });
  });

  it('a game the player has no row of: no prediction ("Spėjimas nerastas")', async () => {
    expect((await single(7))?.prediction).toBeNull();
  });

  it('an unknown game is not found', async () => {
    expect(await single(999)).toBeNull();
  });

  it("R-50: a non-public tournament's game is not found for a player not in it, and found for an admin", async () => {
    await client.query(
      'update tournaments set is_public = false where id = $1',
      [TOURNAMENT.id],
    );
    expect(await single(10, CAI)).toBeNull();
    expect(await single(10, CAI, true)).not.toBeNull();
    expect(await single(10, ADA)).not.toBeNull();
  });
});
