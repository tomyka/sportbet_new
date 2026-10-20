// Slice 13, R-110: the round writers - each under the tournament's lock,
// deciding in the domain, and recalculating when a change can move a point.

import { type RoundEntry, type Tournament } from '@sportbet/domain';
import { at, rate, roundNo, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  deleteRound,
  insertRound,
  loadTournamentTotals,
  recalculateInOwnTransaction,
  updateRound,
} from '../src';
import { RECALCULATION_LOCK_NAMESPACE } from '../src/recalculation/lock';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, G7, OTHER, savePlaying, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');

const entry = (overrides: Partial<RoundEntry> = {}): RoundEntry => ({
  name: '39 turas',
  number: roundNo(39),
  stage: 'play-offs',
  rate: rate(2),
  survival: false,
  knockout: true,
  ...overrides,
});

/** Round 21 (number 1) and round 22 (number 2) belong to the world's tournament. */
const ROUND_1 = 21;
const ROUND_2 = 22;

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await client.query(
    "insert into rounds (id, tournament_id, number, name, stage, rate, survival, knockout) overriding system value values (23, 4, 1, '1 turas', 'regular', 1, true, false)",
  );
  // Game 7 is scored 88:79 and ADA called it: the one match points row.
  await saveGames(db, TOURNAMENT, [G7]);
  await savePlaying(db, TOURNAMENT, ADA);
  await client.query(
    "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 7, 88, 79, 'real')",
  );
  await recalculateInOwnTransaction(db, TOURNAMENT);
});

const write = (
  overrides: {
    tournament?: Tournament;
    now?: typeof NOW;
  } = {},
) => ({
  tournament: overrides.tournament ?? TOURNAMENT,
  now: overrides.now ?? NOW,
});

const roundRows = async () =>
  z
    .array(
      z.object({
        id: z.int(),
        number: z.int(),
        name: z.string(),
        stage: z.string(),
        rate: z.int(),
        survival: z.boolean(),
        knockout: z.boolean(),
      }),
    )
    .parse(
      (
        await client.query(
          'select id, number, name, stage, rate, survival, knockout from rounds where tournament_id = 3 order by id',
        )
      ).rows,
    );

const matchTotal = async () =>
  (await loadTournamentTotals(db, TOURNAMENT, [ADA])).totals.find(
    (total) => total.player === ADA,
  )?.match;

/** The world's tournament finished: its end date passed, game 7 its only game and scored (R-21). */
const finishTournament = () =>
  client.query("update tournaments set ends_on = '2026-10-10' where id = 3");

describe('insertRound (insertEvent, R-110)', () => {
  it('round insert: the round is stored as the admin set it, and its id returned', async () => {
    const inserted = unwrap(
      await insertRound(db, { ...write(), entry: entry() }),
    );
    expect(inserted.boardChanged).toBe(true);
    expect(await roundRows()).toContainEqual({
      id: inserted.round,
      number: 39,
      name: '39 turas',
      stage: 'play-offs',
      rate: 2,
      survival: false,
      knockout: true,
    });
    expect(await roundRows()).toHaveLength(3);
  });

  it('round insert: a number the tournament has is refused, nothing written', async () => {
    expect(
      await insertRound(db, {
        ...write(),
        entry: entry({ number: roundNo(2) }),
      }),
    ).toEqual({ ok: false, refusal: 'duplicate-number' });
    expect(await roundRows()).toHaveLength(2);
  });

  it('round insert: the same number in another tournament is a different round', async () => {
    const inserted = await insertRound(db, {
      ...write({ tournament: OTHER }),
      entry: entry({ number: roundNo(2) }),
    });
    expect(inserted.ok).toBe(true);
  });

  it('round insert: a finished tournament refuses it (R-110)', async () => {
    await finishTournament();
    expect(await insertRound(db, { ...write(), entry: entry() })).toEqual({
      ok: false,
      refusal: 'tournament-finished',
    });
    expect(await roundRows()).toHaveLength(2);
  });

  it('round insert: a tournament that is gone is refused', async () => {
    expect(
      await insertRound(db, {
        ...write({ tournament: { ...TOURNAMENT, id: 99 } }),
        entry: entry(),
      }),
    ).toEqual({ ok: false, refusal: 'no-tournament' });
  });
});

describe('updateRound (updateEvent, R-37, R-110)', () => {
  const change = (overrides: Partial<RoundEntry>, round = ROUND_1) =>
    updateRound(db, {
      ...write(),
      round,
      entry: entry({
        name: '1 turas',
        number: roundNo(1),
        stage: 'regular',
        rate: rate(1),
        survival: true,
        knockout: false,
        ...overrides,
      }),
    });

  it('round update: a rate change changes the stored match points', async () => {
    const before = await matchTotal();
    expect(before?.isPositive()).toBe(true);
    expect(unwrap(await change({ rate: rate(3) })).boardChanged).toBe(true);
    const after = await matchTotal();
    expect(before === undefined ? null : after?.equals(before.times(3))).toBe(
      true,
    );
    expect((await roundRows()).find((row) => row.id === ROUND_1)?.rate).toBe(3);
  });

  it('round update: its number may move, and its games follow', async () => {
    unwrap(await change({ number: roundNo(5) }));
    expect((await roundRows()).find((row) => row.id === ROUND_1)?.number).toBe(
      5,
    );
    expect(
      (await client.query('select round_id from games where id = 7')).rows,
    ).toEqual([{ round_id: ROUND_1 }]);
    expect((await matchTotal())?.isPositive()).toBe(true);
  });

  it('round update: a rename alone leaves the stored points as they were', async () => {
    const before = await matchTotal();
    // A sentinel only a recalculation would erase.
    await client.query(
      'update match_points set "full" = "full" + 1 where source = \'ruled\'',
    );
    // A rename moves no stored point (the sentinel below stays), yet the season changed.
    expect(unwrap(await change({ name: 'Pirmas turas' })).boardChanged).toBe(
      true,
    );
    const after = await matchTotal();
    expect(after?.hundredths).toBe((before?.hundredths ?? 0) + 100);
    expect((await roundRows()).find((row) => row.id === ROUND_1)?.name).toBe(
      'Pirmas turas',
    );
  });

  it('round update: another round`s number is refused, nothing written', async () => {
    expect(await change({ number: roundNo(2) })).toEqual({
      ok: false,
      refusal: 'duplicate-number',
    });
    expect((await roundRows()).find((row) => row.id === ROUND_1)?.number).toBe(
      1,
    );
  });

  it('round update: a round of another tournament is unknown', async () => {
    expect(await change({}, 23)).toEqual({
      ok: false,
      refusal: 'unknown-round',
    });
    expect(await change({}, 99)).toEqual({
      ok: false,
      refusal: 'unknown-round',
    });
  });

  it('round update: a finished tournament refuses it (R-110), changing nothing', async () => {
    await finishTournament();
    const before = await matchTotal();
    expect(await change({ rate: rate(3) })).toEqual({
      ok: false,
      refusal: 'tournament-finished',
    });
    expect((await matchTotal())?.hundredths).toBe(before?.hundredths);
    expect((await roundRows()).find((row) => row.id === ROUND_1)?.rate).toBe(1);
  });

  it('round update: a refusal inside a caller`s transaction writes nothing there', async () => {
    const outcome = await db.transaction(async (tx) => {
      const refused = await updateRound(tx, {
        ...write(),
        round: ROUND_1,
        entry: entry({ number: roundNo(2) }),
      });
      const accepted = await updateRound(tx, {
        ...write(),
        round: ROUND_2,
        entry: entry({ number: roundNo(2), name: 'Antras' }),
      });
      return [refused.ok, accepted.ok];
    });
    expect(outcome).toEqual([false, true]);
    expect((await roundRows()).map((row) => row.name)).toEqual([
      '1 turas',
      'Antras',
    ]);
  });
});

describe('deleteRound (updateEvent delete; the keys are restrict)', () => {
  it('round delete: a round without games goes', async () => {
    expect(await deleteRound(db, { ...write(), round: ROUND_2 })).toEqual({
      ok: true,
      value: { boardChanged: true },
    });
    expect((await roundRows()).map((row) => row.id)).toEqual([ROUND_1]);
  });

  it('round delete: a round with games is kept', async () => {
    expect(await deleteRound(db, { ...write(), round: ROUND_1 })).toEqual({
      ok: false,
      refusal: 'has-games',
    });
    expect(await roundRows()).toHaveLength(2);
  });

  it('round delete: a round a survival pick names is kept, not a database error', async () => {
    await client.query(
      'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (1, 3, 22, 11)',
    );
    expect(await deleteRound(db, { ...write(), round: ROUND_2 })).toEqual({
      ok: false,
      refusal: 'has-picks',
    });
  });

  it('round delete: a round of another tournament, or none, is unknown', async () => {
    expect(await deleteRound(db, { ...write(), round: 23 })).toEqual({
      ok: false,
      refusal: 'unknown-round',
    });
    expect(await deleteRound(db, { ...write(), round: 99 })).toEqual({
      ok: false,
      refusal: 'unknown-round',
    });
  });

  it('round delete: a finished tournament refuses it (R-110)', async () => {
    await finishTournament();
    expect(await deleteRound(db, { ...write(), round: ROUND_2 })).toEqual({
      ok: false,
      refusal: 'tournament-finished',
    });
    expect(await roundRows()).toHaveLength(2);
  });
});

describe('the lock', () => {
  it('round writers: a tournament lock held past 5 s fails the write cleanly (lock_not_available), writing nothing', async () => {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock($1::int, $2::int)', [
        RECALCULATION_LOCK_NAMESPACE,
        TOURNAMENT.id,
      ]);
      await expect(
        insertRound(db, { ...write(), entry: entry() }),
      ).rejects.toMatchObject({ cause: { code: '55P03' } });
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await roundRows()).toHaveLength(2);
  }, 15_000);
});
