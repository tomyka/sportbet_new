import type { StandingsEntry } from '@sportbet/domain';
import { at, roundNo, team } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { saveStandingsOrder, saveStandingsRow } from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  G10_OPEN,
  G7,
  G8,
  G9,
  OTHER,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
/** Round 2's first tip-off (game 8) closes standings when the deadline round is 2. */
const ROUND_TWO = { ...TOURNAMENT, standingsDeadlineRound: roundNo(2) };
/** The database's clock in these cases: `instant`, by default the world's fixed moment. */
const atClock =
  (instant = NOW) =>
  () =>
    Promise.resolve(instant);

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, ROUND_TWO);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN]);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
});

const rowsOf = async (player = 1) =>
  z
    .array(
      z.object({
        team_id: z.int(),
        place: z.int().nullable(),
        play_offs: z.boolean().nullable(),
        final_four: z.boolean().nullable(),
        final_place: z.int().nullable(),
      }),
    )
    .parse(
      (
        await client.query(
          'select team_id, place, play_offs, final_four, final_place from standings_predictions where player_id = $1 order by team_id',
          [player],
        )
      ).rows,
    );

const placesOf = async () => (await rowsOf()).map((row) => row.place);

/** The teams of these database ids, as a posted order names them. */
const teamsOf = (ids: readonly number[]) => ids.map((id) => team(String(id)));

const entry = (
  id: number,
  over: Partial<Omit<StandingsEntry, 'team'>> = {},
): StandingsEntry => ({
  team: team(String(id)),
  place: null,
  playOffs: null,
  finalFour: null,
  finalPlace: null,
  ...over,
});

const blankRow = (team: number) => ({
  team_id: team,
  place: null,
  play_offs: null,
  final_four: null,
  final_place: null,
});

const saveRow = (row: StandingsEntry, clock = atClock(), player = ADA) =>
  saveStandingsRow(db, { player, entry: row, now: NOW }, clock);

const saveOrder = (order: readonly number[], clock = atClock(), player = ADA) =>
  saveStandingsOrder(db, { player, order: teamsOf(order), now: NOW }, clock);

describe('saveStandingsRow', () => {
  it("standings save: writes the row as posted, seeding the player's missing rows blank", async () => {
    const saved = await saveRow(
      entry(11, { place: 2, playOffs: true, finalFour: false }),
    );
    expect(saved.ok).toBe(true);
    expect(await rowsOf()).toEqual([
      {
        team_id: 11,
        place: 2,
        play_offs: true,
        final_four: false,
        final_place: null,
      },
      blankRow(12),
      blankRow(13),
      blankRow(14),
    ]);
  });

  it('standings save: a posted blank clears a saved column', async () => {
    await saveRow(entry(11, { place: 2, playOffs: true }));
    await saveRow(entry(11));
    expect((await rowsOf())[0]).toEqual(blankRow(11));
  });

  it('standings save: a player not in the tournament, or a team not stored, is not yours and nothing is written', async () => {
    expect(await saveRow(entry(11, { place: 1 }), atClock(), CAI)).toEqual({
      ok: false,
      refusal: 'not-yours',
    });
    expect(await saveRow(entry(99, { place: 1 }))).toEqual({
      ok: false,
      refusal: 'not-yours',
    });
    expect(await rowsOf(3)).toEqual([]);
    expect(await rowsOf(1)).toEqual([]);
  });

  it("standings save (issue 255): the team's tournament decides, so a team of one the player is not in is not yours", async () => {
    await saveTournament(db, OTHER);
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (41, 4, 'Partizan')",
    );
    expect(await saveRow(entry(41, { place: 1 }))).toEqual({
      ok: false,
      refusal: 'not-yours',
    });
  });

  it("standings save: the deadline is judged at the database's time once the rows are locked; refused, nothing is written", async () => {
    expect(await saveRow(entry(11, { place: 1 }), atClock(G8.tipOff))).toEqual({
      ok: false,
      refusal: 'closed',
    });
    expect(await rowsOf()).toEqual([]);
  });

  it('standings save: the deadline is judged no earlier than the call, even when the database clock lags', async () => {
    expect(
      await saveStandingsRow(
        db,
        { player: ADA, entry: entry(11, { place: 1 }), now: G8.tipOff },
        atClock(NOW),
      ),
    ).toEqual({ ok: false, refusal: 'closed' });
    expect(
      await saveStandingsOrder(
        db,
        { player: ADA, order: teamsOf([11, 12, 13, 14]), now: G8.tipOff },
        atClock(NOW),
      ),
    ).toEqual({ ok: false, refusal: 'closed' });
  });

  it("standings save: a conflict with another of the player's rows is refused; another player's rows are not the player's", async () => {
    await saveRow(entry(11, { place: 1 }), atClock(), BEN);
    expect((await saveRow(entry(11, { place: 1 }))).ok).toBe(true);
    expect(await saveRow(entry(12, { place: 1 }))).toEqual({
      ok: false,
      refusal: 'place-taken',
    });
  });

  it('standings save: a refused save seeds no missing row, on its own or inside a caller transaction', async () => {
    await client.query(
      'insert into standings_predictions (player_id, team_id, place) values (1, 11, 1)',
    );
    expect(await saveRow(entry(12, { place: 1 }))).toEqual({
      ok: false,
      refusal: 'place-taken',
    });
    expect((await rowsOf()).map((row) => row.team_id)).toEqual([11]);
    await db.transaction(async (tx) => {
      expect(
        await saveStandingsRow(
          tx,
          { player: ADA, entry: entry(12, { place: 1 }), now: NOW },
          atClock(),
        ),
      ).toEqual({ ok: false, refusal: 'place-taken' });
      expect(
        (
          await saveStandingsRow(
            tx,
            { player: ADA, entry: entry(12, { place: 2 }), now: NOW },
            atClock(),
          )
        ).ok,
      ).toBe(true);
    });
    expect((await rowsOf()).map((row) => [row.team_id, row.place])).toEqual([
      [11, 1],
      [12, 2],
      [13, null],
      [14, null],
    ]);
  });

  it("standings save: refused inside a caller's transaction, only the save's savepoint rolls back - the caller's own writes stay and the transaction goes on", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`insert into standings_predictions (player_id, team_id, place) values (2, 11, 3)`,
      );
      expect(
        await saveStandingsRow(
          tx,
          { player: ADA, entry: entry(11, { place: 1 }), now: NOW },
          atClock(G8.tipOff),
        ),
      ).toEqual({ ok: false, refusal: 'closed' });
      expect(
        await saveStandingsOrder(
          tx,
          { player: ADA, order: teamsOf([11, 12]), now: NOW },
          atClock(),
        ),
      ).toEqual({ ok: false, refusal: 'mismatch' });
      const inside = await tx.execute(
        sql`select player_id, team_id, place from standings_predictions order by player_id, team_id`,
      );
      expect(inside.rows).toEqual([{ player_id: 2, team_id: 11, place: 3 }]);
    });
    expect(await rowsOf(1)).toEqual([]);
    expect((await rowsOf(2)).map((row) => [row.team_id, row.place])).toEqual([
      [11, 3],
    ]);
  });

  it('standings save: a place outside the table of four is refused', async () => {
    expect(await saveRow(entry(11, { place: 5 }))).toEqual({
      ok: false,
      refusal: 'place-out-of-table',
    });
  });
});

describe('saveStandingsOrder', () => {
  it('standings reorder: writes places only - ticks and final places stay', async () => {
    await saveRow(
      entry(11, { playOffs: true, finalFour: true, finalPlace: 1 }),
    );
    const saved = await saveOrder([14, 13, 12, 11]);
    expect(saved.ok).toBe(true);
    expect(
      (await rowsOf()).map((row) => [
        row.team_id,
        row.place,
        row.play_offs,
        row.final_four,
        row.final_place,
      ]),
    ).toEqual([
      [11, 4, true, true, 1],
      [12, 3, null, null, null],
      [13, 2, null, null, null],
      [14, 1, null, null, null],
    ]);
  });

  it("standings reorder: a player with no rows yet has them seeded and placed (R-79's first save)", async () => {
    expect((await saveOrder([12, 11, 14, 13])).ok).toBe(true);
    expect(await placesOf()).toEqual([2, 1, 4, 3]);
    expect(await rowsOf(2)).toEqual([]);
  });

  it('standings reorder: an order that is not the whole table is a mismatch, nothing written', async () => {
    expect(await saveOrder([11, 12])).toEqual({
      ok: false,
      refusal: 'mismatch',
    });
    expect(await rowsOf()).toEqual([]);
  });

  it('standings reorder (issue 255): a team of another tournament in the order is a mismatch, and its row is not touched', async () => {
    await saveTournament(db, OTHER);
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (41, 4, 'Partizan')",
    );
    expect(await saveOrder([11, 12, 13, 41])).toEqual({
      ok: false,
      refusal: 'mismatch',
    });
    expect(await saveOrder([11, 12, 13, 14, 41])).toEqual({
      ok: false,
      refusal: 'mismatch',
    });
    expect(
      (await rowsOf()).filter(
        (row) => row.team_id === 41 || row.place !== null,
      ),
    ).toEqual([]);
  });

  it('standings reorder: after the deadline it is closed', async () => {
    expect(await saveOrder([11, 12, 13, 14], atClock(G8.tipOff))).toEqual({
      ok: false,
      refusal: 'closed',
    });
  });

  it('standings reorder: a first team not stored, a player not in the tournament, or no order is not yours', async () => {
    expect(await saveOrder([99, 11, 12, 13])).toEqual({
      ok: false,
      refusal: 'not-yours',
    });
    expect(await saveOrder([11, 12, 13, 14], atClock(), CAI)).toEqual({
      ok: false,
      refusal: 'not-yours',
    });
    expect(await saveOrder([])).toEqual({ ok: false, refusal: 'not-yours' });
  });

  it('standings save: a lock held past 5 s fails the save (lock_not_available), writing nothing', async () => {
    await saveRow(entry(11));
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query(
        'select 1 from standings_predictions where player_id = 1 for update',
      );
      await expect(saveOrder([11, 12, 13, 14])).rejects.toMatchObject({
        cause: { code: '55P03' },
      });
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await placesOf()).toEqual([null, null, null, null]);
  }, 15_000);
});
