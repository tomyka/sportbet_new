import { at, roundNo, team } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { saveGames } from '../src/season/repository';
import { playerRowsIn } from '../src/standings/repository';
import {
  loadLockedStandingsTable,
  writeStandingsPlaces,
  writeStandingsRow,
} from '../src/standings/table-repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  CAI,
  G10_OPEN,
  G7,
  G8,
  G9,
  OLY,
  OTHER,
  REA,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
/** Round 2's first tip-off (game 8) closes standings when the deadline round is 2. */
const ROUND_TWO = { ...TOURNAMENT, standingsDeadlineRound: roundNo(2) };
const atClock =
  (instant = NOW) =>
  () =>
    Promise.resolve(instant);

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, ROUND_TWO);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN]);
  await savePlaying(db, TOURNAMENT, ADA);
});

const rowsOf = async () =>
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
          'select team_id, place, play_offs, final_four, final_place from standings_predictions where player_id = 1 order by team_id',
        )
      ).rows,
    );

const load = (
  over: { player?: typeof ADA; team?: typeof ZAL } = {},
  clock = atClock(),
) =>
  db.transaction((tx) =>
    loadLockedStandingsTable(tx, {
      player: over.player ?? ADA,
      team: over.team ?? ZAL,
      now: NOW,
      clock,
    }),
  );

describe('loadLockedStandingsTable', () => {
  it("standings table: the posted team's tournament's table, the player's missing rows seeded", async () => {
    await client.query(
      'insert into standings_predictions (player_id, team_id, place, play_offs) values (1, 13, 1, true)',
    );
    const table = await load();
    expect(table?.view().rows.map((row) => [row.name, row.place])).toEqual([
      ['Real', 1],
      ['Fenerbahce', null],
      ['Olympiacos', null],
      ['Zalgiris', null],
    ]);
    expect((await rowsOf()).map((row) => row.team_id)).toEqual([
      11, 12, 13, 14,
    ]);
  });

  it('standings table: a team not stored, or a player not in its tournament, has no table', async () => {
    expect(await load({ team: team('99') })).toBeNull();
    expect(await load({ player: CAI })).toBeNull();
    await saveTournament(db, OTHER);
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (41, 4, 'Partizan')",
    );
    expect(await load({ team: team('41') })).toBeNull();
  });

  it("standings table: judged at the database's time once the rows are locked, never before the call", async () => {
    expect((await load({}, atClock(G8.tipOff)))?.view().closes).toEqual({
      state: 'closed',
    });
    expect((await load())?.view().closes).toEqual({
      state: 'open',
      at: G8.tipOff,
    });
  });
});

describe('writeStandingsRow and writeStandingsPlaces', () => {
  beforeEach(async () => {
    await client.query(
      'insert into standings_predictions (player_id, team_id, place, play_offs, final_four, final_place) values (1, 11, null, true, true, 1), (1, 12, null, null, null, null)',
    );
  });

  it("standings table: writeStandingsRow writes a decided row's five columns", async () => {
    await writeStandingsRow(db, ADA, {
      team: OLY,
      place: 1,
      playOffs: true,
      finalFour: false,
      finalPlace: null,
    });
    expect((await rowsOf())[1]).toEqual({
      team_id: 12,
      place: 1,
      play_offs: true,
      final_four: false,
      final_place: null,
    });
  });

  it('standings table: writeStandingsPlaces writes places only - ticks and final places stay', async () => {
    await writeStandingsPlaces(db, ADA, [
      { team: OLY, place: 1 },
      { team: ZAL, place: 2 },
    ]);
    expect(await rowsOf()).toEqual([
      {
        team_id: 11,
        place: 2,
        play_offs: true,
        final_four: true,
        final_place: 1,
      },
      {
        team_id: 12,
        place: 1,
        play_offs: null,
        final_four: null,
        final_place: null,
      },
    ]);
  });

  it("standings table: another player's rows are not touched", async () => {
    await savePlaying(db, TOURNAMENT, CAI);
    await client.query(
      'insert into standings_predictions (player_id, team_id, place) values (3, 13, 4), (1, 13, null)',
    );
    await writeStandingsPlaces(db, ADA, [{ team: REA, place: 1 }]);
    await writeStandingsRow(db, ADA, {
      team: REA,
      place: 1,
      playOffs: true,
      finalFour: null,
      finalPlace: null,
    });
    expect(
      (
        await client.query(
          'select player_id, place, play_offs from standings_predictions where team_id = 13 order by player_id',
        )
      ).rows,
    ).toEqual([
      { player_id: 1, place: 1, play_offs: true },
      { player_id: 3, place: 4, play_offs: null },
    ]);
  });
});

describe('playerRowsIn', () => {
  /** Whether another connection can lock the player's rows right now. */
  const lockableElsewhere = async () => {
    const other = await client.connect();
    try {
      await other.query('begin');
      await other.query(
        'select 1 from standings_predictions where player_id = 1 for update nowait',
      );
      return true;
    } catch {
      return false;
    } finally {
      await other.query('rollback');
      other.release();
    }
  };

  beforeEach(async () => {
    await client.query(
      'insert into standings_predictions (player_id, team_id, place) values (1, 11, 2), (1, 12, null)',
    );
  });

  it("standings table: the player's rows of the tournament, by team; unlocked by default (the page's read)", async () => {
    await db.transaction(async (tx) => {
      const rows = await playerRowsIn(tx, ADA, TOURNAMENT);
      expect(rows.map((row) => [row.team, row.place])).toEqual([
        [ZAL, 2],
        [OLY, null],
      ]);
      expect(await lockableElsewhere()).toBe(true);
    });
  });

  it('standings table: with { lock: true } the rows stay locked for the transaction (FOR UPDATE)', async () => {
    await db.transaction(async (tx) => {
      await playerRowsIn(tx, ADA, TOURNAMENT, { lock: true });
      expect(await lockableElsewhere()).toBe(false);
    });
    expect(await lockableElsewhere()).toBe(true);
  });
});
