import {
  Game,
  ruledRules,
  sportbetRules,
  type RuleSet,
} from '@sportbet/domain';
import { at, gameNo, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { savePrediction } from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { saveTournamentPlayers } from '../src/player/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  G10,
  G7,
  G8,
  G9,
  OTHER,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-15T12:00:00Z');

/**
 * The world's game 10, not locked: world.ts locks it after a move
 * (2026-10-03, R-13), and these saves need an open game.
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
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  // Blank rows, as joining writes: ADA's of games 9 and 10, BEN's and CAI's of 10.
  await client.query(
    "insert into match_predictions (player_id, game_id, origin) values (1, 9, 'real'), (1, 10, 'real'), (2, 10, 'real'), (3, 10, 'real')",
  );
});

const save = (
  game: number,
  home: number | null,
  away: number | null,
  rules: RuleSet = ruledRules,
  player = ADA,
) =>
  savePrediction(db, {
    player,
    game: gameNo(game),
    entry: { home, away },
    now: NOW,
    rules,
  });

const rowOf = async (player: number, game: number) =>
  z
    .array(
      z.object({
        home: z.int().nullable(),
        away: z.int().nullable(),
        origin: z.string(),
      }),
    )
    .parse(
      (
        await client.query(
          'select home, away, origin from match_predictions where player_id = $1 and game_id = $2',
          [player, game],
        )
      ).rows,
    )[0];

const audits = async () =>
  z
    .array(
      z.object({
        player_id: z.int(),
        game_id: z.int(),
        home: z.int(),
        away: z.int(),
        old_home: z.int().nullable(),
        old_away: z.int().nullable(),
      }),
    )
    .parse(
      (
        await client.query(
          'select player_id, game_id, home, away, old_home, old_away from audit_prediction_games order by id',
        )
      ).rows,
    );

const statusOf = async (tournament: number) =>
  z
    .array(
      z.object({
        switched_off: z.boolean(),
        admin_hidden: z.boolean(),
        fill_ins: z.int(),
      }),
    )
    .parse(
      (
        await client.query(
          'select switched_off, admin_hidden, fill_ins from tournament_players where player_id = 1 and tournament_id = $1',
          [tournament],
        )
      ).rows,
    )[0];

describe('savePrediction (updatePredictionResultUser)', () => {
  it('save: the row takes the pair as a real prediction, and the answer is the odds from the votes now, at the round rate', async () => {
    await client.query(
      'update match_predictions set home = 90, away = 70 where player_id = 2 and game_id = 10',
    );
    const saved = await save(10, 88, 79);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(await rowOf(1, 10)).toEqual({ home: 88, away: 79, origin: 'real' });
    // Two home votes of two: home log2(2/2) = 0, away log2(2/0.5) = 2.
    expect(saved.value.odds.home.hundredths).toBe(0);
    expect(saved.value.odds.away.hundredths).toBe(200);
    expect(saved.value.rate.value).toBe(1);
  });

  it('save: clearing writes the blank pair', async () => {
    await save(10, 88, 79);
    expect((await save(10, null, null)).ok).toBe(true);
    expect(await rowOf(1, 10)).toEqual({
      home: null,
      away: null,
      origin: 'real',
    });
  });

  it('save (issue 254): a game the player has no row of is "not yours", and nothing is written', async () => {
    expect(await save(10, 88, 79, ruledRules, ADA)).toMatchObject({ ok: true });
    expect(await save(7, 88, 79)).toEqual({ ok: false, refusal: 'not-yours' });
    expect(await rowOf(1, 7)).toBeUndefined();
  });

  it('save (LR-1): a started game is closed, and its row is not touched', async () => {
    expect(await save(9, 88, 79)).toEqual({ ok: false, refusal: 'closed' });
    expect(await rowOf(1, 9)).toEqual({
      home: null,
      away: null,
      origin: 'real',
    });
  });

  it('save (R-25, R-60): a saved score is audited with the row as it was; a clear and a refusal are not', async () => {
    await save(10, 85, 80);
    await save(10, 88, 79);
    await save(10, null, null);
    await save(9, 88, 79);
    expect(await audits()).toEqual([
      {
        player_id: 1,
        game_id: 10,
        home: 85,
        away: 80,
        old_home: null,
        old_away: null,
      },
      {
        player_id: 1,
        game_id: 10,
        home: 88,
        away: 79,
        old_home: 85,
        old_away: 80,
      },
    ]);
  });

  it('save (ruled, R-7, R-57): a saved score switches ADA back on in this tournament, its count reset; a clear does not', async () => {
    await client.query(
      'update tournament_players set switched_off = true, fill_ins = 20 where player_id = 1',
    );
    await save(10, null, null);
    expect(await statusOf(TOURNAMENT.id)).toEqual({
      switched_off: true,
      admin_hidden: false,
      fill_ins: 20,
    });
    await save(10, 88, 79);
    expect(await statusOf(TOURNAMENT.id)).toEqual({
      switched_off: false,
      admin_hidden: false,
      fill_ins: 0,
    });
  });

  it('save (ruled, R-7): another tournament ADA is switched off in stays off', async () => {
    await saveTournament(db, OTHER);
    await saveTournamentPlayers(db, OTHER, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 20 },
    ]);
    await save(10, 88, 79);
    expect(await statusOf(OTHER.id)).toEqual({
      switched_off: true,
      admin_hidden: false,
      fill_ins: 20,
    });
  });

  it('save (ruled, R-19): an admin hide stays', async () => {
    await client.query(
      'update tournament_players set switched_off = true, admin_hidden = true where player_id = 1',
    );
    await save(10, 88, 79);
    expect(await statusOf(TOURNAMENT.id)).toMatchObject({
      switched_off: false,
      admin_hidden: true,
    });
  });

  it('save (sportbet, PL-1): any accepted save switches ADA on everywhere, a clear included, counts kept', async () => {
    await saveTournament(db, OTHER);
    await saveTournamentPlayers(db, OTHER, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 3 },
    ]);
    await client.query(
      'update tournament_players set switched_off = true, fill_ins = 2 where player_id = 1 and tournament_id = $1',
      [TOURNAMENT.id],
    );
    await save(10, null, null, sportbetRules);
    expect(await statusOf(TOURNAMENT.id)).toEqual({
      switched_off: false,
      admin_hidden: false,
      fill_ins: 2,
    });
    expect(await statusOf(OTHER.id)).toEqual({
      switched_off: false,
      admin_hidden: false,
      fill_ins: 3,
    });
  });

  it('save: the audit is erased with the account (R-25): its player key cascades', async () => {
    const actions = await client.query(
      "select confdeltype from pg_constraint where conname = 'audit_prediction_games_player_fk'",
    );
    expect(actions.rows).toEqual([{ confdeltype: 'c' }]);
  });
});
