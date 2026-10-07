import { Game, ruledRules, sportbetRules } from '@sportbet/domain';
import {
  at,
  gameNo,
  roundNo,
  scriptedDice,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { saveResult } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  G10_OPEN,
  G7,
  G8,
  G9,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');

/** Game 11: round 1, FEN at home to ZAL, tipped off 2026-10-12, no result. */
const G11 = unwrap(
  Game.stored({
    id: gameNo(11),
    round: roundNo(1),
    home: FEN,
    away: ZAL,
    tipOff: at('2026-10-12T18:00:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN, G11]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  // ADA predicted game 11; BEN's row is blank; CAI is switched off (R-32).
  await client.query(
    "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 11, 88, 79, 'real'), (2, 11, null, null, 'real'), (3, 11, null, null, 'real')",
  );
  await client.query(
    'update tournament_players set switched_off = true, fill_ins = 20 where player_id = 3',
  );
});

const atNow = () => Promise.resolve(NOW);
const NO_DICE = scriptedDice([]);

const enter = (
  game: number,
  home: string,
  away: string,
  rules = ruledRules,
  dice = scriptedDice([10, 10, 10, 5, 5, 5]),
) =>
  saveResult(
    db,
    { game: gameNo(game), boxes: { home, away }, now: NOW, rules, dice },
    atNow,
  );

const gameRow = async (game: number) =>
  z
    .array(
      z.object({
        home_score: z.int().nullable(),
        away_score: z.int().nullable(),
        postponed: z.boolean(),
      }),
    )
    .parse(
      (
        await client.query(
          'select home_score, away_score, postponed from games where id = $1',
          [game],
        )
      ).rows,
    )[0];

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

const pointsOf = async (game: number) =>
  z
    .array(z.object({ player_id: z.int(), source: z.string() }))
    .parse(
      (
        await client.query(
          'select player_id, source::text as source from match_points where game_id = $1 order by player_id',
          [game],
        )
      ).rows,
    );

const countOf = async (player: number) =>
  z
    .array(z.object({ fill_ins: z.int(), switched_off: z.boolean() }))
    .parse(
      (
        await client.query(
          'select fill_ins, switched_off from tournament_players where player_id = $1 and tournament_id = $2',
          [player, TOURNAMENT.id],
        )
      ).rows,
    )[0];

describe('saveResult (ResultController::updateResult)', () => {
  it('result: a score writes the game, fills in the blank row of a player not switched off (FI-1, R-32), counts it (R-7), and scores the game under ruledRules', async () => {
    expect(await enter(11, '85', '80')).toEqual({ ok: true, value: null });
    expect(await gameRow(11)).toEqual({
      home_score: 85,
      away_score: 80,
      postponed: false,
    });
    expect(await rowOf(2, 11)).toEqual({
      home: 85,
      away: 70,
      origin: 'fill-in',
    });
    expect(await rowOf(3, 11)).toEqual({
      home: null,
      away: null,
      origin: 'real',
    });
    expect(await countOf(2)).toEqual({ fill_ins: 1, switched_off: false });
    expect(await pointsOf(11)).toEqual([
      { player_id: 1, source: 'ruled' },
      { player_id: 2, source: 'ruled' },
    ]);
  });

  it("result: the boxes' refusals, in UpdateResultRequest's order, write nothing", async () => {
    expect(await enter(11, '88', '')).toEqual({
      ok: false,
      refusal: { kind: 'fields', errors: [{ field: 'away', problem: 'half' }] },
    });
    expect(await enter(11, '-3', '80')).toEqual({
      ok: false,
      refusal: {
        kind: 'fields',
        errors: [{ field: 'home', problem: 'negative' }],
      },
    });
    expect(await enter(10, '85', '80', ruledRules, NO_DICE)).toEqual({
      ok: false,
      refusal: { kind: 'not-started' },
    });
    expect(await enter(11, '80', '80', ruledRules, NO_DICE)).toEqual({
      ok: false,
      refusal: { kind: 'level' },
    });
    expect(await enter(99, '85', '80', ruledRules, NO_DICE)).toEqual({
      ok: false,
      refusal: { kind: 'no-game' },
    });
    expect(await gameRow(11)).toEqual({
      home_score: null,
      away_score: null,
      postponed: false,
    });
    expect(await pointsOf(11)).toEqual([]);
  });

  it('result (R-63): -1 : -1 postpones the game and nothing is scored; emptying the boxes undoes it', async () => {
    expect(await enter(10, '-1', '-1', ruledRules, NO_DICE)).toEqual({
      ok: true,
      value: null,
    });
    expect(await gameRow(10)).toMatchObject({ postponed: true });
    expect(await enter(10, '', '', ruledRules, NO_DICE)).toEqual({
      ok: true,
      value: null,
    });
    expect(await gameRow(10)).toMatchObject({ postponed: false });
  });

  it('result: clearing a scored game removes its points and keeps its fill-ins (sportbet, issue 268)', async () => {
    await enter(11, '85', '80');
    expect(await enter(11, '', '', ruledRules, NO_DICE)).toEqual({
      ok: true,
      value: null,
    });
    expect(await gameRow(11)).toMatchObject({ home_score: null });
    expect(await pointsOf(11)).toEqual([]);
    expect(await rowOf(2, 11)).toMatchObject({ origin: 'fill-in' });
  });

  it('result (R-22): a finished tournament is refused and nothing written (decision 7)', async () => {
    await client.query(
      "update tournaments set ends_on = '2026-10-13' where id = $1",
      [TOURNAMENT.id],
    );
    await client.query(
      'update games set home_score = 70, away_score = 75, postponed = false, locked_since = null where id in (9, 10)',
    );
    await enter(11, '85', '80', sportbetRules);
    expect(await enter(11, '86', '80', ruledRules, NO_DICE)).toEqual({
      ok: false,
      refusal: { kind: 'frozen' },
    });
  });
});
