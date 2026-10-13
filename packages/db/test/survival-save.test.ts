import { ruledRules, type SurvivalPickEntry } from '@sportbet/domain';
import { at, gameNo, roundNo, team, unwrap } from '@sportbet/domain/testing';
import { Game } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { saveSurvivalPick } from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
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
  REA,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const MON = team('15');
/** Round 1's second open game: Fenerbahce - Monaco, the day after game 10. */
const G11 = unwrap(
  Game.schedule({
    id: gameNo(11),
    round: roundNo(1),
    home: FEN,
    away: MON,
    tipOff: at('2026-10-21T18:00:00Z'),
  }),
);
/** The database's clock in these cases: `instant`, by default the world's fixed moment. */
const atClock =
  (instant = NOW) =>
  () =>
    Promise.resolve(instant);

beforeEach(async () => {
  await saveWorld(db);
  await client.query(
    "insert into teams (id, tournament_id, name) overriding system value values (15, 3, 'Monaco')",
  );
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN, G11]);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
});

const pickRows = z.array(
  z.object({ player_id: z.int(), round_id: z.int(), team_id: z.int() }),
);
const picksOf = async () =>
  pickRows.parse(
    (
      await client.query(
        'select player_id, round_id, team_id from survival_picks order by player_id, round_id',
      )
    ).rows,
  );
const entry = (
  id: string,
  shownRound: number | null = 1,
): SurvivalPickEntry => ({
  team: team(id),
  shownRound: shownRound === null ? null : roundNo(shownRound),
});
const save = (
  id: string,
  options: {
    clock?: () => Promise<ReturnType<typeof at>>;
    player?: typeof ADA;
    now?: ReturnType<typeof at>;
  } = {},
) =>
  saveSurvivalPick(
    db,
    {
      player: options.player ?? ADA,
      entry: entry(id),
      rules: ruledRules,
      now: options.now ?? NOW,
    },
    options.clock ?? atClock(),
  );

describe('saveSurvivalPick', () => {
  it('survival save: a pick is written, then switched within the round, leaving one row', async () => {
    expect(await save('13')).toEqual({
      ok: true,
      value: { round: roundNo(1), team: REA },
    });
    expect(await picksOf()).toEqual([
      { player_id: 1, round_id: 21, team_id: 13 },
    ]);
    expect(await save('15')).toEqual({
      ok: true,
      value: { round: roundNo(1), team: MON },
    });
    expect(await picksOf()).toEqual([
      { player_id: 1, round_id: 21, team_id: 15 },
    ]);
  });

  it('survival save: a post that names no round is judged on the current one', async () => {
    const saved = await saveSurvivalPick(
      db,
      { player: ADA, entry: entry('13', null), rules: ruledRules, now: NOW },
      atClock(),
    );
    expect(saved.ok).toBe(true);
  });

  it('survival save: a refusal writes nothing', async () => {
    await save('13');
    // Zalgiris played game 7 already.
    expect(await save('11')).toEqual({
      ok: false,
      refusal: 'team-already-started',
    });
    expect(await picksOf()).toEqual([
      { player_id: 1, round_id: 21, team_id: 13 },
    ]);
  });

  it("survival save: refused inside a caller's transaction, only the save's savepoint rolls back", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`insert into survival_picks (player_id, tournament_id, round_id, team_id) values (2, 3, 21, 14)`,
      );
      expect(
        await saveSurvivalPick(
          tx,
          { player: ADA, entry: entry('11'), rules: ruledRules, now: NOW },
          atClock(),
        ),
      ).toEqual({ ok: false, refusal: 'team-already-started' });
      const inside = await tx.execute(
        sql`select player_id, team_id from survival_picks`,
      );
      expect(inside.rows).toEqual([{ player_id: 2, team_id: 14 }]);
    });
    expect(await picksOf()).toEqual([
      { player_id: 2, round_id: 21, team_id: 14 },
    ]);
  });

  it("survival save: a team not stored, another tournament's team, or a player not in its tournament is unknown-team", async () => {
    await saveTournament(db, OTHER);
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (41, 4, 'Partizan')",
    );
    expect(await save('99')).toEqual({ ok: false, refusal: 'unknown-team' });
    expect(await save('41')).toEqual({ ok: false, refusal: 'unknown-team' });
    expect(await save('13', { player: CAI })).toEqual({
      ok: false,
      refusal: 'unknown-team',
    });
    expect(await picksOf()).toEqual([]);
  });

  it('survival save: a page that showed another round is refused', async () => {
    const saved = await saveSurvivalPick(
      db,
      { player: ADA, entry: entry('13', 2), rules: ruledRules, now: NOW },
      atClock(),
    );
    expect(saved).toEqual({ ok: false, refusal: 'round-changed' });
  });

  it("survival save: judged at the database's time once the locks are held - a save that waited across the tip-off is refused", async () => {
    expect(await save('13', { clock: atClock(G10_OPEN.tipOff) })).toEqual({
      ok: false,
      refusal: 'team-already-started',
    });
    expect(await picksOf()).toEqual([]);
  });

  it('survival save: judged no earlier than the call, even when the database clock lags', async () => {
    expect(
      await save('13', { now: G10_OPEN.tipOff, clock: atClock(NOW) }),
    ).toEqual({
      ok: false,
      refusal: 'team-already-started',
    });
  });

  it('survival save: a pick cannot move once its game has tipped off (R-4)', async () => {
    await save('13');
    expect(await save('15', { clock: atClock(G10_OPEN.tipOff) })).toEqual({
      ok: false,
      refusal: 'pick-locked',
    });
  });

  it('survival save: two concurrent posts of one player are taken one after the other, leaving one row', async () => {
    const [first, second] = await Promise.all([save('13'), save('15')]);
    expect([first.ok, second.ok]).toEqual([true, true]);
    const rows = await picksOf();
    expect(rows).toHaveLength(1);
    expect([13, 15]).toContain(rows[0]?.team_id);
  });

  it("survival save: the player's statuses are the mutex of their picks - held past 5 s, the save fails (lock_not_available), writing nothing", async () => {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query(
        'select 1 from tournament_players where player_id = 1 for update',
      );
      await expect(save('13')).rejects.toMatchObject({
        cause: { code: '55P03' },
      });
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await picksOf()).toEqual([]);
  }, 15_000);

  it("survival save: a round's game row held FOR UPDATE past 5 s fails the save (lock_not_available)", async () => {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select 1 from games where id = 10 for update');
      await expect(save('13')).rejects.toMatchObject({
        cause: { code: '55P03' },
      });
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await picksOf()).toEqual([]);
  }, 15_000);

  it('survival save: no points row is written and no status changes', async () => {
    await client.query(
      'update tournament_players set switched_off = true, fill_ins = 4 where player_id = 1',
    );
    await save('13');
    const points = await client.query(
      'select count(*)::int as rows from survival_points',
    );
    expect(points.rows).toEqual([{ rows: 0 }]);
    const status = await client.query(
      'select switched_off, fill_ins from tournament_players where player_id = 1',
    );
    expect(status.rows).toEqual([{ switched_off: true, fill_ins: 4 }]);
  });
});
