// Slice 13, R-89, R-90, R-13, R-110: the game writers - a seeded insert, a
// change under the game row's lock, a delete only while nobody has predicted.

import {
  Game,
  ruledRules,
  sportbetRules,
  type GameFormEntry,
  type GameId,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { at, gameNo, roundNo, team, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  advanceIdentitySequences,
  deleteGame,
  insertGame,
  loadTournamentTotals,
  recalculateLocked,
  savePrediction,
  updateGame,
} from '../src';
import { RECALCULATION_LOCK_NAMESPACE } from '../src/recalculation/lock';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  G7,
  OLY,
  OTHER,
  REA,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');
const ROUND_1 = 21;
const ROUND_2 = 22;

/** Game 11: round 1, REA at home to FEN, tipped off 2026-10-12, no result. */
const G11 = unwrap(
  Game.stored({
    id: gameNo(11),
    round: roundNo(1),
    home: REA,
    away: FEN,
    tipOff: at('2026-10-12T18:00:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);

/** Game 12: round 2, ZAL at home to REA, still to come (2026-10-25). */
const G12 = unwrap(
  Game.stored({
    id: gameNo(12),
    round: roundNo(2),
    home: ZAL,
    away: REA,
    tipOff: at('2026-10-25T18:00:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await client.query(
    "insert into rounds (id, tournament_id, number, name, stage, rate, survival, knockout) overriding system value values (23, 4, 1, '1 turas', 'regular', 1, true, false)",
  );
  await saveGames(db, TOURNAMENT, [G7]);
  await advanceIdentitySequences(db);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  // ADA called game 7 exactly; the others' rows on it are blank.
  await client.query(
    "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 7, 88, 79, 'real'), (2, 7, null, null, 'real'), (3, 7, null, null, 'real')",
  );
  const refusal = await recalculateLocked(db, TOURNAMENT, ruledRules);
  if (refusal !== null)
    throw new Error(`test setup: recalculation refused (${refusal})`);
});

/** Saves more of the world's games and moves the sequences past them. */
const withGames = async (...more: Game[]) => {
  await saveGames(db, TOURNAMENT, more);
  await advanceIdentitySequences(db);
};

const entry = (overrides: Partial<GameFormEntry> = {}): GameFormEntry => ({
  tipOff: at('2026-11-01T18:00:00Z'),
  home: ZAL,
  away: FEN,
  roundId: ROUND_1,
  ...overrides,
});

const write = (
  options: { tournament?: Tournament; rules?: RuleSet; now?: typeof NOW } = {},
) => ({
  tournament: options.tournament ?? TOURNAMENT,
  rules: options.rules ?? ruledRules,
  now: options.now ?? NOW,
});

const count = async (sql: string, params: unknown[] = []) =>
  z
    .array(z.object({ n: z.coerce.number() }))
    .parse((await client.query(sql, params)).rows)[0]?.n;

const gameRow = async (id: number) =>
  z
    .array(
      z.object({
        round_id: z.int(),
        home_team_id: z.int(),
        away_team_id: z.int(),
        tip_off: z.date(),
        locked_since: z.date().nullable(),
        postponed: z.boolean(),
      }),
    )
    .parse(
      (
        await client.query(
          'select round_id, home_team_id, away_team_id, tip_off, locked_since, postponed from games where id = $1',
          [id],
        )
      ).rows,
    )[0];

const matchTotal = async () =>
  (await loadTournamentTotals(db, TOURNAMENT, ruledRules, [ADA])).totals.find(
    (total) => total.player === ADA,
  )?.match;

/** Every game scored and the end date passed (R-21): the tournament is finished. */
const finishTournament = () =>
  client.query("update tournaments set ends_on = '2026-10-10' where id = 3");

describe('insertGame (insertGame, R-91, issue 272)', () => {
  it('game insert: stored with its round, teams and tip-off, and every player gets a blank row', async () => {
    const inserted = unwrap(
      await insertGame(db, { ...write(), entry: entry() }),
    );
    const row = await gameRow(inserted.game);
    expect(row).toMatchObject({
      round_id: ROUND_1,
      home_team_id: 11,
      away_team_id: 14,
      locked_since: null,
      postponed: false,
    });
    expect(row?.tip_off.toISOString()).toBe('2026-11-01T18:00:00.000Z');
    expect(
      (
        await client.query(
          'select player_id, home, away, origin, filled_in_at from match_predictions where game_id = $1 order by player_id',
          [inserted.game],
        )
      ).rows,
    ).toEqual([
      {
        player_id: 1,
        home: null,
        away: null,
        origin: 'real',
        filled_in_at: null,
      },
      {
        player_id: 2,
        home: null,
        away: null,
        origin: 'real',
        filled_in_at: null,
      },
      {
        player_id: 3,
        home: null,
        away: null,
        origin: 'real',
        filled_in_at: null,
      },
    ]);
  });

  it('game insert: no game_odds row is made, and nothing else is derived', async () => {
    const odds = await count('select count(*) as n from game_odds');
    const points = await count('select count(*) as n from match_points');
    const inserted = unwrap(
      await insertGame(db, { ...write(), entry: entry() }),
    );
    expect(
      await count('select count(*) as n from game_odds where game_id = $1', [
        inserted.game,
      ]),
    ).toBe(0);
    expect(await count('select count(*) as n from game_odds')).toBe(odds);
    expect(await count('select count(*) as n from match_points')).toBe(points);
  });

  it('game insert: the players of another tournament get no row', async () => {
    await savePlaying(db, OTHER, ADA);
    const inserted = unwrap(
      await insertGame(db, { ...write(), entry: entry() }),
    );
    expect(
      await count(
        'select count(*) as n from match_predictions where game_id = $1',
        [inserted.game],
      ),
    ).toBe(3);
  });

  it.each([
    ['a round of another tournament', { roundId: 23 }],
    ['a round that does not exist', { roundId: 99 }],
    ['a team that is not the tournament`s', { home: team('99') }],
  ] as const)(
    'game insert: %s is a mixed tournament (issue 272), nothing written',
    async (_label, change) => {
      const games = await count('select count(*) as n from games');
      const rows = await count('select count(*) as n from match_predictions');
      expect(
        await insertGame(db, { ...write(), entry: entry(change) }),
      ).toEqual({ ok: false, refusal: 'mixed-tournament' });
      expect(await count('select count(*) as n from games')).toBe(games);
      expect(await count('select count(*) as n from match_predictions')).toBe(
        rows,
      );
    },
  );

  it('game insert: one team on both sides, or a pair the round has, is refused', async () => {
    expect(
      await insertGame(db, { ...write(), entry: entry({ away: ZAL }) }),
    ).toEqual({ ok: false, refusal: 'same-team-twice' });
    expect(
      await insertGame(db, {
        ...write(),
        entry: entry({ home: ZAL, away: OLY }),
      }),
    ).toEqual({ ok: false, refusal: 'duplicate-pair' });
  });

  it('game insert: a finished tournament refuses it (R-110)', async () => {
    await finishTournament();
    expect(await insertGame(db, { ...write(), entry: entry() })).toEqual({
      ok: false,
      refusal: 'tournament-finished',
    });
  });

  it('game insert: a tournament that is gone is refused', async () => {
    expect(
      await insertGame(db, {
        ...write({ tournament: { ...TOURNAMENT, id: 99 } }),
        entry: entry(),
      }),
    ).toEqual({ ok: false, refusal: 'no-tournament' });
  });

  it('game insert: a refusal inside a caller`s transaction writes nothing there', async () => {
    const outcome = await db.transaction(async (tx) => {
      const refused = await insertGame(tx, {
        ...write(),
        entry: entry({ away: ZAL }),
      });
      const accepted = await insertGame(tx, { ...write(), entry: entry() });
      return [refused.ok, accepted.ok];
    });
    expect(outcome).toEqual([false, true]);
    expect(await count('select count(*) as n from games')).toBe(2);
  });
});

const change = (
  game: number,
  overrides: Partial<GameFormEntry>,
  options: { rules?: RuleSet; now?: typeof NOW } = {},
) =>
  updateGame(db, {
    game: gameNo(game),
    entry: entry({
      tipOff: at('2026-10-12T18:00:00Z'),
      home: REA,
      away: FEN,
      roundId: ROUND_1,
      ...overrides,
    }),
    rules: options.rules ?? ruledRules,
    now: options.now ?? NOW,
  });

describe('updateGame (updateGame, R-90, R-13)', () => {
  it('game update (R-90): before tip-off anything changes, even with a real prediction', async () => {
    await withGames(G12);
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 12, 90, 80, 'real')",
    );
    unwrap(
      await change(12, {
        tipOff: at('2026-10-26T18:00:00Z'),
        home: OLY,
        away: FEN,
        roundId: ROUND_1,
      }),
    );
    expect(await gameRow(12)).toMatchObject({
      round_id: ROUND_1,
      home_team_id: 12,
      away_team_id: 14,
    });
  });

  it('game update (R-90): a started game with a real prediction keeps its teams, nothing written', async () => {
    await withGames(G11);
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 11, 90, 80, 'real')",
    );
    expect(await change(11, { away: OLY })).toEqual({
      ok: false,
      refusal: 'teams-fixed',
    });
    expect(await gameRow(11)).toMatchObject({ away_team_id: 14 });
  });

  it('game update (R-90): the same game`s date and round still change', async () => {
    await withGames(G11);
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 11, 90, 80, 'real')",
    );
    unwrap(
      await change(11, {
        tipOff: at('2026-10-30T18:00:00Z'),
        roundId: ROUND_2,
      }),
    );
    const row = await gameRow(11);
    expect(row?.round_id).toBe(ROUND_2);
    expect(row?.tip_off.toISOString()).toBe('2026-10-30T18:00:00.000Z');
  });

  it('game update (R-90): a started game without a real prediction may change its teams', async () => {
    await withGames(G11);
    // A blank row is not a prediction.
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 11, null, null, 'real')",
    );
    unwrap(await change(11, { away: OLY }));
    expect(await gameRow(11)).toMatchObject({ away_team_id: 12 });
  });

  it('game update (R-90): a fill-in is not a real prediction', async () => {
    await withGames(G11);
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin, filled_in_at) values (1, 11, 70, 65, 'fill-in', now())",
    );
    expect((await change(11, { away: OLY })).ok).toBe(true);
    expect(await gameRow(11)).toMatchObject({ away_team_id: 12 });
  });

  it('game update (R-90): a score saved once and cleared again still fixes the teams (the audit row stays)', async () => {
    await withGames(G11);
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 11, null, null, 'real')",
    );
    await client.query(
      'insert into audit_prediction_games (player_id, game_id, home, away, old_home, old_away, at) values (1, 11, 90, 80, null, null, now())',
    );
    expect(await change(11, { away: OLY })).toEqual({
      ok: false,
      refusal: 'teams-fixed',
    });
  });

  it('game update (R-13, ruled): moved later after it locked, the game stays locked', async () => {
    await withGames(G11);
    unwrap(await change(11, { tipOff: at('2026-10-20T18:00:00Z') }));
    const row = await gameRow(11);
    expect(row?.locked_since?.toISOString()).toBe('2026-10-12T18:00:00.000Z');
    expect(row?.tip_off.toISOString()).toBe('2026-10-20T18:00:00.000Z');
  });

  it('game update (sportbet): moved later after tip-off, the game reopens', async () => {
    await withGames(G11);
    unwrap(
      await change(
        11,
        { tipOff: at('2026-10-20T18:00:00Z') },
        { rules: sportbetRules },
      ),
    );
    expect((await gameRow(11))?.locked_since).toBeNull();
  });

  it('game update (R-13, ruled): moved before tip-off, the game stays open', async () => {
    await withGames(G12);
    unwrap(
      await change(12, {
        tipOff: at('2026-10-27T18:00:00Z'),
        home: ZAL,
        away: REA,
        roundId: ROUND_2,
      }),
    );
    expect((await gameRow(12))?.locked_since).toBeNull();
  });

  it('game update: a moved round changes the stored points (a scored game`s round carries its rate)', async () => {
    const before = await matchTotal();
    expect(before?.isPositive()).toBe(true);
    unwrap(
      await change(7, {
        tipOff: G7.tipOff,
        home: ZAL,
        away: OLY,
        roundId: ROUND_2,
      }),
    );
    const after = await matchTotal();
    expect(before === undefined ? null : after?.equals(before.times(2))).toBe(
      true,
    );
  });

  it('game update: another game`s pair in the round is refused', async () => {
    await withGames(G12);
    expect(
      await change(12, { home: ZAL, away: OLY, roundId: ROUND_1 }),
    ).toEqual({ ok: false, refusal: 'duplicate-pair' });
  });

  it('game update: a team of another tournament is a mixed tournament', async () => {
    await withGames(G12);
    expect(await change(12, { home: team('99'), roundId: ROUND_2 })).toEqual({
      ok: false,
      refusal: 'mixed-tournament',
    });
  });

  it('game update: a game that does not exist is refused', async () => {
    expect(await change(99, {})).toEqual({ ok: false, refusal: 'no-game' });
  });

  it('game update: a finished tournament refuses it (R-110), changing nothing', async () => {
    await finishTournament();
    const before = await matchTotal();
    expect(await change(7, { roundId: ROUND_2 })).toEqual({
      ok: false,
      refusal: 'tournament-finished',
    });
    expect((await gameRow(7))?.round_id).toBe(ROUND_1);
    expect((await matchTotal())?.hundredths).toBe(before?.hundredths);
  });
});

/** A blank game, with every player's blank row and the blank game_odds row sportbet made. */
async function addBlankGame(
  overrides: Partial<GameFormEntry> = {},
): Promise<GameId> {
  const inserted = unwrap(
    await insertGame(db, { ...write(), entry: entry(overrides) }),
  );
  await client.query(
    "insert into game_odds (source, game_id, home, away, draw) values ('production', $1, 0, 0, 0)",
    [inserted.game],
  );
  return inserted.game;
}

describe('deleteGame (deleteGame, R-89)', () => {
  it('game delete (R-89): a game with blank rows only goes, with its rows and its blank odds row', async () => {
    const game = await addBlankGame();
    expect(await deleteGame(db, { game, rules: ruledRules, now: NOW })).toEqual(
      { ok: true, value: null },
    );
    expect(await gameRow(game)).toBeUndefined();
    for (const table of ['match_predictions', 'game_odds', 'match_points']) {
      expect(
        await count(`select count(*) as n from ${table} where game_id = $1`, [
          game,
        ]),
      ).toBe(0);
    }
    // The other game's rows are untouched.
    expect(
      await count(
        'select count(*) as n from match_predictions where game_id = 7',
      ),
    ).toBe(3);
    expect((await matchTotal())?.isPositive()).toBe(true);
  });

  it("game delete removes only that game's derived rows, under every source, and no other game's or tournament's", async () => {
    const game = await addBlankGame();
    await client.query(
      "insert into game_odds (source, game_id, home, away, draw) values ('ruled', $1, 100, 100, 100), ('sportbet', $1, 100, 100, 100), ('ruled', 7, 110, 120, 130), ('sportbet', 7, 110, 120, 130) on conflict do nothing",
      [game],
    );
    const before = await count(
      'select count(*) as n from game_odds where game_id <> $1',
      [game],
    );
    const pointsBefore = await count(
      'select count(*) as n from match_points where game_id <> $1',
      [game],
    );
    await deleteGame(db, { game, rules: ruledRules, now: NOW });
    expect(
      await count('select count(*) as n from game_odds where game_id = $1', [
        game,
      ]),
    ).toBe(0);
    expect(
      await count('select count(*) as n from game_odds where game_id <> $1', [
        game,
      ]),
    ).toBe(before);
    expect(
      await count(
        'select count(*) as n from match_points where game_id <> $1',
        [game],
      ),
    ).toBe(pointsBefore);
    expect(
      await count('select count(*) as n from game_odds where game_id = 7'),
    ).toBeGreaterThanOrEqual(2);
  });

  it('game delete (R-125): a survival pick on the home or the away team in the round of the game keeps it, and a pick in another round does not', async () => {
    const game = await addBlankGame();
    await client.query(
      'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (1, 3, 22, 11)',
    );
    expect(await deleteGame(db, { game, rules: ruledRules, now: NOW })).toEqual(
      { ok: true, value: null },
    );
    const again = await addBlankGame();
    for (const team of [11, 14]) {
      await client.query(
        'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (2, 3, 21, $1) on conflict (player_id, round_id) do update set team_id = excluded.team_id',
        [team],
      );
      expect(
        await deleteGame(db, { game: again, rules: ruledRules, now: NOW }),
      ).toEqual({ ok: false, refusal: 'has-survival-picks' });
      expect(await gameRow(again)).toBeDefined();
    }
    await client.query(
      'update survival_picks set team_id = 13 where player_id = 2',
    );
    expect(
      await deleteGame(db, { game: again, rules: ruledRules, now: NOW }),
    ).toEqual({ ok: true, value: null });
  });

  it('game delete (R-89): one real prediction keeps the game and its rows', async () => {
    const game = await addBlankGame();
    await client.query(
      'update match_predictions set home = 90, away = 80 where game_id = $1 and player_id = 1',
      [game],
    );
    expect(await deleteGame(db, { game, rules: ruledRules, now: NOW })).toEqual(
      { ok: false, refusal: 'has-real-predictions' },
    );
    expect(await gameRow(game)).toBeDefined();
    expect(
      await count(
        'select count(*) as n from match_predictions where game_id = $1',
        [game],
      ),
    ).toBe(3);
  });

  it('game delete (R-89): a score saved once and cleared again keeps the game (the audit row stays)', async () => {
    const game = await addBlankGame();
    await client.query(
      'insert into audit_prediction_games (player_id, game_id, home, away, old_home, old_away, at) values (1, $1, 90, 80, null, null, now())',
      [game],
    );
    expect(await deleteGame(db, { game, rules: ruledRules, now: NOW })).toEqual(
      { ok: false, refusal: 'has-real-predictions' },
    );
  });

  it('game delete: a fill-in is no real prediction, but a result keeps the game', async () => {
    await withGames(G11);
    await client.query(
      'update games set home_score = 80, away_score = 70 where id = 11',
    );
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin, filled_in_at) values (1, 11, 75, 70, 'fill-in', now())",
    );
    expect(
      await deleteGame(db, { game: gameNo(11), rules: ruledRules, now: NOW }),
    ).toEqual({ ok: false, refusal: 'has-result' });
    expect(await gameRow(11)).toBeDefined();
  });

  it('game delete: a result entered once and cleared again keeps the game (R-69)', async () => {
    const game = await addBlankGame();
    await client.query(
      'insert into audit_results (player_id, game_id, old_home, old_away, old_postponed, new_home, new_away, new_postponed, at) values (1, $1, null, null, false, null, null, true, now())',
      [game],
    );
    expect(await deleteGame(db, { game, rules: ruledRules, now: NOW })).toEqual(
      { ok: false, refusal: 'has-result' },
    );
  });

  it('game delete: a finished tournament refuses it (R-110)', async () => {
    const game = await addBlankGame();
    await finishTournament();
    await client.query(
      'update games set home_score = 1, away_score = 0 where id = $1',
      [game],
    );
    expect(await deleteGame(db, { game, rules: ruledRules, now: NOW })).toEqual(
      { ok: false, refusal: 'tournament-finished' },
    );
  });

  it('game delete: a game that does not exist is refused', async () => {
    expect(
      await deleteGame(db, { game: gameNo(99), rules: ruledRules, now: NOW }),
    ).toEqual({ ok: false, refusal: 'no-game' });
  });

  it('game delete: a game of any tournament is found by its own id', async () => {
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (31, 4, 'A'), (32, 4, 'B')",
    );
    await client.query(
      "insert into games (tournament_id, round_id, home_team_id, away_team_id, tip_off) values (4, 23, 31, 32, '2026-12-01T18:00:00Z')",
    );
    const other = await count(
      'select id as n from games where tournament_id = 4',
    );
    expect(
      await deleteGame(db, {
        game: gameNo(other ?? 0),
        rules: ruledRules,
        now: NOW,
      }),
    ).toEqual({ ok: true, value: null });
  });
});

describe('the locks (R-89: no prediction slips in between the count and the delete)', () => {
  const save = (game: number) =>
    savePrediction(db, {
      player: ADA,
      game: gameNo(game),
      rowGame: gameNo(game),
      entry: { home: 88, away: 79 },
      now: NOW,
      rules: ruledRules,
    });

  const PAIRS = [
    [ZAL, FEN],
    [OLY, ZAL],
    [REA, ZAL],
    [FEN, ZAL],
    [OLY, REA],
  ] as const;

  it('a prediction save racing a delete: one wins, and no row is orphaned', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [home, away] = PAIRS[attempt] ?? [ZAL, FEN];
      const game = await addBlankGame({ home, away });
      const [saved, deleted] = await Promise.all([
        save(game),
        deleteGame(db, { game, rules: ruledRules, now: NOW }),
      ]);
      const exists = (await gameRow(game)) !== undefined;
      const rows = await count(
        'select count(*) as n from match_predictions where game_id = $1',
        [game],
      );
      const audits = await count(
        'select count(*) as n from audit_prediction_games where game_id = $1',
        [game],
      );
      const observed = {
        deleted: deleted.ok ? true : deleted.refusal,
        saved: saved.ok,
        state: [exists, rows, audits],
      };
      // The delete won: the game and every row are gone. The save won: its
      // score and audit row stand, and the delete was refused.
      expect([
        { deleted: true, saved: false, state: [false, 0, 0] },
        {
          deleted: 'has-real-predictions',
          saved: true,
          state: [true, 3, 1],
        },
      ]).toContainEqual(observed);
    }
  }, 30_000);

  it('a game row held past 5 s fails the delete cleanly (lock_not_available), writing nothing', async () => {
    const game = await addBlankGame();
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select 1 from games where id = $1 for share', [game]);
      await expect(
        deleteGame(db, { game, rules: ruledRules, now: NOW }),
      ).rejects.toMatchObject({ cause: { code: '55P03' } });
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await gameRow(game)).toBeDefined();
  }, 15_000);

  it('the tournament lock held past 5 s fails an insert cleanly, writing nothing', async () => {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock($1::int, $2::int)', [
        RECALCULATION_LOCK_NAMESPACE,
        TOURNAMENT.id,
      ]);
      await expect(
        insertGame(db, { ...write(), entry: entry() }),
      ).rejects.toMatchObject({ cause: { code: '55P03' } });
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await count('select count(*) as n from games')).toBe(1);
  }, 15_000);
});
