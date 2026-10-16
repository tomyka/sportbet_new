// Slice 15, R-93, R-94, R-13, R-110: applyEuroleagueImport writes the plan it
// planned again under the tournament's lock - or nothing. The rows are the
// ones sportbet's importer writes (EuroleagueImportTest).

import {
  ruledRules,
  secondsAfter,
  sportbetRules,
  type EuroleagueFixture,
  type Instant,
  type Tournament,
} from '@sportbet/domain';
import { at, testPlayer, player } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { savePlayers } from '../src';
import { applyEuroleagueImport } from '../src/import/apply';
import { previewEuroleagueImport } from '../src/import/preview';
import { loadTournamentTotals } from '../src/points/totals';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  BEFORE_SEASON,
  fixtureSeason,
  fullSeason,
  saveEmptyTournament,
} from './import-support';
import { ADA, BEN, CAI, OTHER, savePlaying, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

/** The apply, judged at the request's `now`: the database's own clock is today's. */
const apply = (given: Parameters<typeof applyEuroleagueImport>[1]) =>
  applyEuroleagueImport(db, given, () => Promise.resolve(given.now));

const FIRST_TIP_OFF = at('2026-09-24T16:00:00Z');
const HOUR = 3600;
const rows = (result: { readonly rows: unknown }) =>
  z.array(z.record(z.string(), z.unknown())).parse(result.rows);
const count = async (sql: string, values: unknown[] = []) =>
  z.number().parse(rows(await client.query(sql, values))[0]?.['n']);

interface Feed {
  readonly fixtures: readonly EuroleagueFixture[];
  readonly postSeasonLeftOut: number;
}

async function season(): Promise<Feed> {
  return fixtureSeason();
}

/** The fixture with its first game (Hapoel v Bayern) at another tip-off. */
async function shifted(seconds: number): Promise<Feed> {
  const feed = await season();
  return {
    ...feed,
    fixtures: feed.fixtures.map((fixture, index) =>
      index === 0
        ? { ...fixture, tipOff: secondsAfter(fixture.tipOff, seconds) }
        : fixture,
    ),
  };
}

function request(
  feed: Feed,
  now: Instant = BEFORE_SEASON,
  tournament: Tournament = TOURNAMENT,
) {
  return {
    tournament,
    fixtures: feed.fixtures,
    postSeasonLeftOut: feed.postSeasonLeftOut,
    now,
    rules: ruledRules,
  };
}

async function fingerprintOf(
  feed: Feed,
  now: Instant = BEFORE_SEASON,
  tournament: Tournament = TOURNAMENT,
): Promise<string> {
  const previewed = await previewEuroleagueImport(
    db,
    request(feed, now, tournament),
  );
  if (!previewed.ok) throw new Error(`refused: ${previewed.refusal.kind}`);
  return previewed.value.fingerprint;
}

/** Previews and applies the feed, as the admin's two clicks do. */
async function importFeed(
  feed: Feed,
  now: Instant = BEFORE_SEASON,
  tournament: Tournament = TOURNAMENT,
) {
  return apply({
    ...request(feed, now, tournament),
    fingerprint: await fingerprintOf(feed, now, tournament),
  });
}

async function imported(
  feed: Feed,
  now: Instant = BEFORE_SEASON,
  tournament: Tournament = TOURNAMENT,
) {
  const result = await importFeed(feed, now, tournament);
  if (!result.ok) throw new Error(`refused: ${result.refusal.kind}`);
  return result.value;
}

const TABLES = [
  'teams',
  'team_outcomes',
  'rounds',
  'games',
  'match_predictions',
  'standings_predictions',
] as const;

async function snapshot(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of TABLES) {
    result[table] = await count(`select count(*)::int as n from ${table}`);
  }
  return result;
}

const hapoelGame = async () =>
  rows(
    await client.query(
      `select g.id, g.tip_off, g.locked_since, g.postponed
         from games g join teams t on t.id = g.home_team_id
        where t.name = 'Hapoel IBI Tel Aviv' and g.round_id = (select id from rounds where number = 1)`,
    ),
  )[0];

describe('applyEuroleagueImport', () => {
  it("writes sportbet's rows: 20 teams, regular rounds at rate 1, 20 games at the feed's UTC", async () => {
    await saveEmptyTournament(db);
    const result = await imported(await season());
    expect(result).toMatchObject({
      teams: 20,
      rounds: 2,
      games: 20,
      moved: 0,
      skipped: 0,
      playersSeeded: 3,
      teamsWithoutCrest: [],
    });
    expect(
      await count(
        'select count(*)::int as n from teams where tournament_id = 3',
      ),
    ).toBe(20);
    expect(await count('select count(*)::int as n from team_outcomes')).toBe(
      20,
    );
    expect(
      rows(
        await client.query(
          'select number, name, stage, rate, survival, knockout from rounds order by number',
        ),
      ),
    ).toEqual([
      {
        number: 1,
        name: '1 turas',
        stage: 'regular',
        rate: 1,
        survival: true,
        knockout: false,
      },
      {
        number: 2,
        name: '2 turas',
        stage: 'regular',
        rate: 1,
        survival: true,
        knockout: false,
      },
    ]);
    expect((await hapoelGame())?.['tip_off']).toEqual(
      new Date('2026-09-24T16:00:00Z'),
    );
    expect(
      await count(
        'select count(*)::int as n from games where home_score is null and not postponed and locked_since is null',
      ),
    ).toBe(20);
  });

  it("gives imported rounds survival off when the tournament's switch is off (R-129)", async () => {
    const noSurvival = { ...TOURNAMENT, survival: false };
    await saveEmptyTournament(db, noSurvival);
    await imported(await season(), BEFORE_SEASON, noSurvival);
    expect(
      await count('select count(*)::int as n from rounds where survival'),
    ).toBe(0);
  });

  it('gives every player 20 blank match rows and 20 standings rows', async () => {
    await saveEmptyTournament(db);
    await imported(await season());
    for (const who of [1, 2, 3]) {
      expect(
        await count(
          `select count(*)::int as n from match_predictions
            where player_id = $1 and home is null and away is null and origin = 'real'`,
          [who],
        ),
      ).toBe(20);
      expect(
        await count(
          'select count(*)::int as n from standings_predictions where player_id = $1 and place is null',
          [who],
        ),
      ).toBe(20);
    }
  });

  it('a second apply writes nothing new, and restores a deleted blank row', async () => {
    await saveEmptyTournament(db);
    await imported(await season());
    const before = await snapshot();
    await client.query(
      'delete from match_predictions where player_id = 2 and game_id = (select min(id) from games)',
    );
    const second = await imported(await season());
    expect(second).toMatchObject({ teams: 0, rounds: 0, games: 0, moved: 0 });
    expect(await snapshot()).toEqual(before);
  });

  it('moves an open game the feed moves (R-13)', async () => {
    await saveEmptyTournament(db);
    await imported(await season());
    const result = await imported(await shifted(HOUR));
    expect(result).toMatchObject({ moved: 1, skipped: 0, games: 0 });
    expect((await hapoelGame())?.['tip_off']).toEqual(
      new Date('2026-09-24T17:00:00Z'),
    );
  });

  it('counts a moved game as unreminded again, and a game left where it was keeps its reminder (sportbet issue 283)', async () => {
    await saveEmptyTournament(db);
    await imported(await season());
    await client.query('update match_predictions set reminded_at = now()');
    const result = await imported(await shifted(HOUR));
    expect(result).toMatchObject({ moved: 1 });
    const moved = await hapoelGame();
    expect(
      await count(
        'select count(*)::int as n from match_predictions where game_id = $1 and reminded_at is not null',
        [moved?.['id']],
      ),
    ).toBe(0);
    expect(
      await count(
        'select count(*)::int as n from match_predictions where game_id <> $1 and reminded_at is not null',
        [moved?.['id']],
      ),
    ).toBeGreaterThan(0);
  });

  it('keeps the date of a game that has tipped off, and counts it skipped', async () => {
    await saveEmptyTournament(db);
    await imported(await season());
    const result = await imported(
      await shifted(HOUR),
      secondsAfter(FIRST_TIP_OFF, 1_800),
    );
    expect(result).toMatchObject({ moved: 0, skipped: 1 });
    expect((await hapoelGame())?.['tip_off']).toEqual(
      new Date('2026-09-24T16:00:00Z'),
    );
  });

  it('keeps the date of a scored game, and counts it skipped', async () => {
    await saveEmptyTournament(db);
    await imported(await season());
    await client.query(
      'update games set home_score = 90, away_score = 80 where id = $1',
      [(await hapoelGame())?.['id']],
    );
    const result = await imported(await shifted(HOUR));
    expect(result).toMatchObject({ moved: 0, skipped: 1 });
    expect((await hapoelGame())?.['tip_off']).toEqual(
      new Date('2026-09-24T16:00:00Z'),
    );
  });

  it('refuses a plan that changed after the preview when a game was added by hand, writing nothing', async () => {
    await saveEmptyTournament(db);
    await imported(await season());
    const fingerprint = await fingerprintOf(await season());
    await client.query(
      `insert into games (tournament_id, round_id, home_team_id, away_team_id, tip_off)
       select g.tournament_id, r2.id, g.home_team_id, g.away_team_id, '2026-10-30T18:00:00Z'
         from games g join rounds r1 on r1.id = g.round_id and r1.number = 1,
              rounds r2 where r2.number = 2 limit 1`,
    );
    const before = await snapshot();
    const result = await apply({
      ...request(await season()),
      fingerprint,
    });
    expect(result).toEqual({ ok: false, refusal: { kind: 'plan-changed' } });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a plan that changed after the preview when the feed changed, writing nothing', async () => {
    await saveEmptyTournament(db);
    await imported(await season());
    const fingerprint = await fingerprintOf(await season());
    const before = await snapshot();
    const result = await apply({
      ...request(await shifted(HOUR)),
      fingerprint,
    });
    expect(result).toEqual({ ok: false, refusal: { kind: 'plan-changed' } });
    expect(await snapshot()).toEqual(before);
    expect((await hapoelGame())?.['tip_off']).toEqual(
      new Date('2026-09-24T16:00:00Z'),
    );
  });

  it('refuses a fingerprint that is not the plan, before anything is written', async () => {
    await saveEmptyTournament(db);
    const result = await apply({
      ...request(await season()),
      fingerprint: 'not-the-fingerprint',
    });
    expect(result).toEqual({ ok: false, refusal: { kind: 'plan-changed' } });
    expect((await snapshot())['teams']).toBe(0);
  });

  it('refuses a finished tournament (R-110), writing nothing', async () => {
    const finished = { ...TOURNAMENT, endsOn: '2026-09-01' };
    await saveEmptyTournament(db, finished);
    const result = await apply({
      ...request(await season(), BEFORE_SEASON, finished),
      fingerprint: 'anything',
    });
    expect(result).toEqual({
      ok: false,
      refusal: { kind: 'tournament-finished' },
    });
    expect((await snapshot())['teams']).toBe(0);
  });

  it('imports into a finished tournament under the sportbet rule set, which never freeze one (same as the slice 13 writers)', async () => {
    const finished = { ...TOURNAMENT, endsOn: '2026-09-01' };
    await saveEmptyTournament(db, finished);
    const feed = await season();
    const given = {
      ...request(feed, BEFORE_SEASON, finished),
      rules: sportbetRules,
    };
    const previewed = await previewEuroleagueImport(db, given);
    if (!previewed.ok) throw new Error(`refused: ${previewed.refusal.kind}`);
    const result = await apply({
      ...given,
      fingerprint: previewed.value.fingerprint,
    });
    expect(result).toMatchObject({ ok: true, value: { games: 20 } });
  });

  it('refuses a tournament that is not there', async () => {
    const result = await apply({
      ...request(await season()),
      fingerprint: 'anything',
    });
    expect(result).toEqual({ ok: false, refusal: { kind: 'no-tournament' } });
  });

  it('refuses a team the tournament lacks, writing nothing (the all-or-nothing rule)', async () => {
    await saveEmptyTournament(db);
    await client.query(
      "insert into teams (tournament_id, name) values (3, 'Zalgiris')",
    );
    const result = await apply({
      ...request(await season()),
      fingerprint: 'anything',
    });
    expect(!result.ok && result.refusal.kind).toBe('unmatched-teams');
    expect((await snapshot())['games']).toBe(0);
  });

  it('leaves another tournament untouched', async () => {
    await saveEmptyTournament(db);
    await saveTournament(db, OTHER);
    await savePlayers(db, [testPlayer(player('9'), 'dan')]);
    await savePlaying(db, OTHER, player('9'));
    await imported(await season(), BEFORE_SEASON, OTHER);
    await imported(await season());
    expect(
      await count(
        'select count(*)::int as n from games where tournament_id = 4',
      ),
    ).toBe(20);
    expect(
      await count(
        'select count(*)::int as n from match_predictions where player_id = 9',
      ),
    ).toBe(20);
    expect(await snapshot()).toEqual({
      teams: 40,
      team_outcomes: 40,
      rounds: 4,
      games: 40,
      match_predictions: 20 + 3 * 20,
      standings_predictions: 20 + 3 * 20,
    });
  });

  it("leaves a player's totals unchanged by its recalculation", async () => {
    await saveEmptyTournament(db);
    await imported(await season());
    const before = await loadTournamentTotals(db, TOURNAMENT, ruledRules, [
      ADA,
      BEN,
      CAI,
    ]);
    await imported(await shifted(HOUR));
    const after = await loadTournamentTotals(db, TOURNAMENT, ruledRules, [
      ADA,
      BEN,
      CAI,
    ]);
    expect(after.totals).toEqual(before.totals);
  });

  it('waits for a prediction save holding a game, then judges under the lock', async () => {
    await saveEmptyTournament(db);
    await imported(await season());
    const feed = await shifted(HOUR);
    const fingerprint = await fingerprintOf(feed);
    const gameId = (await hapoelGame())?.['id'];
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select 1 from games where id = $1 for share', [
        gameId,
      ]);
      let settled = false;
      const applying = apply({
        ...request(feed),
        fingerprint,
      }).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(settled).toBe(false);
      // While it waits, the game gets its result: the move it previewed is
      // now a skip, which it sees once the lock is free.
      await holder.query(
        'update games set home_score = 90, away_score = 80 where id = $1',
        [gameId],
      );
      await holder.query('commit');
      expect(await applying).toEqual({
        ok: false,
        refusal: { kind: 'plan-changed' },
      });
    } finally {
      holder.release();
    }
    expect((await hapoelGame())?.['tip_off']).toEqual(
      new Date('2026-09-24T16:00:00Z'),
    );
  }, 20_000);

  describe('the game rows it locks', () => {
    /** The id of a game that is not the one `shifted` moves. */
    const unmovedGame = async () =>
      z
        .number()
        .parse(
          rows(
            await client.query(
              'select id from games where id <> $1 order by id limit 1',
              [(await hapoelGame())?.['id']],
            ),
          )[0]?.['id'],
        );

    /** Settles as `'done'` with the apply's answer, or `'waiting'` after `ms`. */
    const outcome = async <T>(pending: Promise<T>, ms: number) =>
      Promise.race([
        pending.then((value) => ({ state: 'done' as const, value })),
        new Promise<{ state: 'waiting' }>((resolve) =>
          setTimeout(() => {
            resolve({ state: 'waiting' });
          }, ms),
        ),
      ]);

    it('does not wait for a prediction save holding a game it leaves where it is', async () => {
      await saveEmptyTournament(db);
      await imported(await season());
      const feed = await shifted(HOUR);
      const fingerprint = await fingerprintOf(feed);
      const holder = await client.connect();
      try {
        await holder.query('begin');
        await holder.query('select 1 from games where id = $1 for share', [
          await unmovedGame(),
        ]);
        const answer = await outcome(
          apply({ ...request(feed), fingerprint }),
          4_000,
        );
        expect(answer.state).toBe('done');
        expect(answer.state === 'done' && answer.value).toMatchObject({
          ok: true,
          value: { moved: 1 },
        });
        await holder.query('commit');
      } finally {
        holder.release();
      }
    }, 20_000);

    it('takes no game row at all when the plan moves nothing', async () => {
      await saveEmptyTournament(db);
      await imported(await season());
      const feed = await season();
      const fingerprint = await fingerprintOf(feed);
      const holder = await client.connect();
      try {
        await holder.query('begin');
        await holder.query('select 1 from games for update');
        const answer = await outcome(
          apply({ ...request(feed), fingerprint }),
          4_000,
        );
        expect(answer.state).toBe('done');
        expect(answer.state === 'done' && answer.value).toMatchObject({
          ok: true,
          value: { moved: 0, games: 0 },
        });
        await holder.query('commit');
      } finally {
        holder.release();
      }
    }, 20_000);

    it('waits for a moved game and fails cleanly past the 5 s lock wait, writing nothing', async () => {
      await saveEmptyTournament(db);
      await imported(await season());
      const feed = await shifted(HOUR);
      const fingerprint = await fingerprintOf(feed);
      const holder = await client.connect();
      try {
        await holder.query('begin');
        await holder.query('select 1 from games where id = $1 for share', [
          (await hapoelGame())?.['id'],
        ]);
        await expect(
          apply({ ...request(feed), fingerprint }),
        ).rejects.toMatchObject({ cause: { code: '55P03' } });
        await holder.query('commit');
      } finally {
        holder.release();
      }
      expect((await hapoelGame())?.['tip_off']).toEqual(
        new Date('2026-09-24T16:00:00Z'),
      );
    }, 20_000);
  });

  it('imports a 380-game season for 200 players in well under a minute', async () => {
    await saveEmptyTournament(db);
    const crowd = Array.from({ length: 197 }, (_unused, index) =>
      testPlayer(player(String(index + 10)), `player${String(index + 10)}`),
    );
    await savePlayers(db, crowd);
    await savePlaying(db, TOURNAMENT, ...crowd.map(({ id }) => id));
    const feed = { fixtures: await fullSeason(), postSeasonLeftOut: 0 };
    expect(feed.fixtures).toHaveLength(380);
    const started = Date.now();
    const result = await imported(feed);
    const seconds = (Date.now() - started) / 1000;
    expect(result).toMatchObject({
      teams: 20,
      rounds: 38,
      games: 380,
      playersSeeded: 200,
    });
    expect(
      await count('select count(*)::int as n from match_predictions'),
    ).toBe(380 * 200);
    expect(seconds).toBeLessThan(20);
  }, 120_000);
});
