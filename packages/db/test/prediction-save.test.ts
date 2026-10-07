import {
  Game,
  ruledRules,
  sportbetRules,
  type RuleSet,
} from '@sportbet/domain';
import { at, gameNo, roundNo, unwrap } from '@sportbet/domain/testing';
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
  FEN,
  G10_OPEN,
  G7,
  G8,
  G9,
  OTHER,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-15T12:00:00Z');

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  // Blank rows, as joining writes: ADA's of games 9 and 10, BEN's and CAI's of 10.
  await client.query(
    "insert into match_predictions (player_id, game_id, origin) values (1, 9, 'real'), (1, 10, 'real'), (2, 10, 'real'), (3, 10, 'real')",
  );
});

/** The database's clock in these cases: the world's fixed moment. */
const atNow = () => Promise.resolve(NOW);

const save = (
  game: number,
  home: number | null,
  away: number | null,
  rules: RuleSet = ruledRules,
  player = ADA,
) =>
  savePrediction(
    db,
    {
      player,
      game: gameNo(game),
      rowGame: gameNo(game),
      entry: { home, away },
      now: NOW,
      rules,
    },
    atNow,
  );

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** The database's own clock, to the second rounded up, as an instant. */
const databaseNow = async () => {
  const [row] = z
    .array(z.object({ now: z.date() }))
    .parse(
      (
        await client.query(
          'select to_timestamp(ceil(extract(epoch from clock_timestamp()))) as now',
        )
      ).rows,
    );
  if (row === undefined) throw new Error('no clock');
  return row.now;
};

const instantOfDate = (date: Date) =>
  at(date.toISOString().replace(/\.000Z$/u, 'Z'));

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

describe('savePrediction: issue 254', () => {
  it.each([ruledRules, sportbetRules])(
    "save ($name, issue 254): an open game's id posted with ADA's row of a started game is 'not yours', and neither row is touched",
    async (rules) => {
      expect(
        await savePrediction(
          db,
          {
            player: ADA,
            game: gameNo(10),
            rowGame: gameNo(9),
            entry: { home: 88, away: 79 },
            now: NOW,
            rules,
          },
          atNow,
        ),
      ).toEqual({ ok: false, refusal: 'not-yours' });
      expect(await rowOf(1, 9)).toEqual({
        home: null,
        away: null,
        origin: 'real',
      });
      expect(await rowOf(1, 10)).toEqual({
        home: null,
        away: null,
        origin: 'real',
      });
    },
  );
});

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

// Two connections: one holds a lock in its own transaction while the save,
// on another, waits for it.
describe('savePrediction under a concurrent transaction', () => {
  it('save (LR-1): a save that waited for its row lock across the tip-off is closed, judged when the lock is held', async () => {
    const arrived = await databaseNow();
    // A round-1 game tipping off 2 s after the save arrives, and ADA's row of it.
    const soon = unwrap(
      Game.stored({
        id: gameNo(11),
        round: roundNo(1),
        home: FEN,
        away: ZAL,
        tipOff: instantOfDate(new Date(arrived.getTime() + 2000)),
        result: null,
        recordedWinner: null,
        lockedSince: null,
        postponed: false,
      }),
    );
    await saveGames(db, TOURNAMENT, [soon]);
    await client.query(
      "insert into match_predictions (player_id, game_id, origin) values (1, 11, 'real')",
    );
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query(
        'select 1 from match_predictions where player_id = 1 and game_id = 11 for update',
      );
      const pending = savePrediction(db, {
        player: ADA,
        game: gameNo(11),
        rowGame: gameNo(11),
        entry: { home: 88, away: 79 },
        now: instantOfDate(arrived),
        rules: ruledRules,
      });
      await sleep(3000);
      await holder.query('commit');
      expect(await pending).toEqual({ ok: false, refusal: 'closed' });
    } finally {
      holder.release();
    }
    expect(await rowOf(1, 11)).toEqual({
      home: null,
      away: null,
      origin: 'real',
    });
  });

  it("save (F1): a save waiting for a result write's game lock is then refused as closed", async () => {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select 1 from games where id = 10 for update');
      const pending = save(10, 88, 79);
      await sleep(500);
      await holder.query(
        'update games set home_score = 85, away_score = 80 where id = 10',
      );
      await holder.query('commit');
      expect(await pending).toEqual({ ok: false, refusal: 'closed' });
    } finally {
      holder.release();
    }
    expect(await rowOf(1, 10)).toEqual({
      home: null,
      away: null,
      origin: 'real',
    });
  });

  it('save: a wait for a lock longer than 5 s fails cleanly, writing nothing (lock_timeout)', async () => {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select 1 from games where id = 10 for update');
      await expect(save(10, 88, 79)).rejects.toMatchObject({
        cause: { code: '55P03' },
      });
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await rowOf(1, 10)).toEqual({
      home: null,
      away: null,
      origin: 'real',
    });
  }, 20_000);

  it('save (R-19): an admin hide committed while the save waits is kept', async () => {
    await client.query(
      'update tournament_players set switched_off = true, fill_ins = 20 where player_id = 1',
    );
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query(
        'update tournament_players set admin_hidden = true where player_id = 1 and tournament_id = $1',
        [TOURNAMENT.id],
      );
      const pending = save(10, 88, 79);
      await sleep(500);
      await holder.query('commit');
      expect((await pending).ok).toBe(true);
    } finally {
      holder.release();
    }
    expect(await statusOf(TOURNAMENT.id)).toEqual({
      switched_off: false,
      admin_hidden: true,
      fill_ins: 0,
    });
  });
});
