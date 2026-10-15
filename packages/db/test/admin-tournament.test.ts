// Slice 13, R-110: the admin's tournament writers - create (with its public
// league), update (a finished tournament frozen, R-22) and the tournament the
// admin works on.

import {
  ruledRules,
  sportbetRules,
  type TournamentEntry,
} from '@sportbet/domain';
import {
  at,
  player,
  roundNo,
  testPlayer,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  chooseAdminTournament,
  createTournament,
  loadAdminTournament,
  recalculateLocked,
  savePlayers,
  updateTournament,
} from '../src';
import { saveGames } from '../src/season/repository';
import { savePlayerSettings } from '../src/account/repository';
import { RECALCULATION_LOCK_NAMESPACE } from '../src/recalculation/lock';
import { useTestDatabase } from '../src/testing';
import { ADA, G7, rowsOf, savePlaying, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');
const ADMIN = player('1');

const entry = (overrides: Partial<TournamentEntry> = {}): TournamentEntry => ({
  name: 'Euroleague 2028/29',
  slug: 'euroleague-2028-29',
  standingsDeadlineRound: null,
  status: 'upcoming',
  startsOn: '2028-10-01',
  endsOn: '2029-05-23',
  description: 'Naujas turnyras',
  isPublic: true,
  survival: true,
  ...overrides,
});

beforeEach(async () => {
  await saveWorld(db);
});

const count = async (table: string) =>
  z
    .array(z.object({ n: z.coerce.number() }))
    .parse((await client.query(`select count(*) as n from ${table}`)).rows)[0]
    ?.n;

describe('createTournament (adminStore)', () => {
  it('create: the tournament, its hub profile and exactly one public league named after it', async () => {
    const created = unwrap(await createTournament(db, entry()));
    expect(created).toMatchObject({
      slug: 'euroleague-2028-29',
      name: 'Euroleague 2028/29',
      format: 'euroleague',
      endsOn: '2029-05-23',
      standingsDeadlineRound: null,
      survival: true,
      standingsTableFinal: false,
    });
    const [row] = rowsOf(
      await client.query(
        'select status, starts_on, sport, description, is_public from tournaments where id = $1',
        [created.id],
      ),
    );
    expect(row).toMatchObject({
      status: 'upcoming',
      sport: 'basketball',
      description: 'Naujas turnyras',
      is_public: true,
    });
    expect(
      (
        await client.query(
          'select name, is_public from leagues where tournament_id = $1',
          [created.id],
        )
      ).rows,
    ).toEqual([{ name: 'Euroleague 2028/29', is_public: true }]);
  });

  it('create: the optional fields may be empty', async () => {
    const created = unwrap(
      await createTournament(
        db,
        entry({
          startsOn: null,
          endsOn: null,
          description: null,
          isPublic: false,
          survival: false,
          standingsDeadlineRound: roundNo(6),
        }),
      ),
    );
    expect(created).toMatchObject({
      endsOn: null,
      survival: false,
      standingsDeadlineRound: 6,
    });
  });

  it('create: a slug another tournament holds is refused, and nothing is written', async () => {
    const tournaments = await count('tournaments');
    const leagues = await count('leagues');
    expect(
      await createTournament(db, entry({ slug: TOURNAMENT.slug })),
    ).toEqual({ ok: false, refusal: 'slug-taken' });
    expect(await count('tournaments')).toBe(tournaments);
    expect(await count('leagues')).toBe(leagues);
  });

  it('create: inside a caller`s transaction a refusal leaves the caller`s writes alone', async () => {
    const outcome = await db.transaction(async (tx) => {
      const first = await createTournament(tx, entry());
      const second = await createTournament(tx, entry());
      return [first.ok, second.ok];
    });
    expect(outcome).toEqual([true, false]);
    expect(await count('leagues')).toBe(1);
  });
});

const update = (
  overrides: Partial<TournamentEntry>,
  options: {
    readonly rules?: typeof ruledRules;
    readonly tournament?: typeof TOURNAMENT;
  } = {},
) =>
  updateTournament(db, {
    tournament: options.tournament ?? TOURNAMENT,
    entry: {
      name: TOURNAMENT.name,
      slug: TOURNAMENT.slug,
      standingsDeadlineRound: TOURNAMENT.standingsDeadlineRound,
      status: 'active',
      startsOn: null,
      endsOn: TOURNAMENT.endsOn,
      description: null,
      isPublic: true,
      survival: TOURNAMENT.survival,
      ...overrides,
    },
    rules: options.rules ?? ruledRules,
    now: NOW,
  });

describe('updateTournament (adminUpdate, R-110)', () => {
  it('update: every field of the entry is written', async () => {
    const updated = unwrap(
      await update({
        name: 'Euroleague 2026/27 (naujas)',
        slug: 'el-2026-27',
        standingsDeadlineRound: roundNo(6),
        endsOn: '2027-06-01',
        survival: false,
        status: 'upcoming',
        startsOn: '2026-10-01',
        description: 'Aprasymas',
        isPublic: false,
      }),
    );
    expect(updated).toMatchObject({
      id: TOURNAMENT.id,
      slug: 'el-2026-27',
      name: 'Euroleague 2026/27 (naujas)',
      standingsDeadlineRound: 6,
      endsOn: '2027-06-01',
      survival: false,
    });
    expect(
      (
        await client.query(
          'select status, starts_on, description, is_public from tournaments where id = $1',
          [TOURNAMENT.id],
        )
      ).rows[0],
    ).toMatchObject({
      status: 'upcoming',
      description: 'Aprasymas',
      is_public: false,
    });
  });

  it('update: the deadline round, end date and survival feed no stored point - nothing is written to a points table', async () => {
    // Game 7 is scored and ADA called it; standings and survival rows exist too.
    await saveGames(db, TOURNAMENT, [G7]);
    await savePlaying(db, TOURNAMENT, ADA);
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 7, 88, 79, 'real')",
    );
    await client.query(
      'insert into standings_predictions (player_id, team_id, place, play_offs) values (1, 11, 1, true)',
    );
    await client.query(
      'insert into team_outcomes (team_id, place, play_offs, final_four) values (11, 1, true, false)',
    );
    const refusal = await recalculateLocked(db, TOURNAMENT, ruledRules);
    if (refusal !== null) throw new Error('test setup: recalculation refused');
    const points = async () =>
      await Promise.all(
        [
          'match_points',
          'standings_points',
          'survival_points',
          'game_odds',
        ].map(async (table) =>
          rowsOf(await client.query(`select * from ${table} order by 1, 2, 3`)),
        ),
      );
    const before = await points();
    expect(before[0]).not.toHaveLength(0);
    unwrap(
      await update({
        standingsDeadlineRound: roundNo(2),
        endsOn: '2027-06-01',
        survival: false,
      }),
    );
    expect(await points()).toEqual(before);
  });

  it('update: a slug another tournament holds is refused, and nothing is written', async () => {
    unwrap(await createTournament(db, entry()));
    expect(await update({ slug: 'euroleague-2028-29', name: 'Kita' })).toEqual({
      ok: false,
      refusal: 'slug-taken',
    });
    expect(
      (
        await client.query('select name from tournaments where id = $1', [
          TOURNAMENT.id,
        ])
      ).rows,
    ).toEqual([{ name: TOURNAMENT.name }]);
  });

  it('update: a tournament that is gone is refused', async () => {
    expect(await update({}, { tournament: { ...TOURNAMENT, id: 99 } })).toEqual(
      { ok: false, refusal: 'no-tournament' },
    );
  });

  it('update: the tournament is decided as it stands under the lock, not as the caller held it', async () => {
    // The caller holds the stored end date; another admin has since changed it.
    await client.query(
      "update tournaments set ends_on = '2027-06-30' where id = $1",
      [TOURNAMENT.id],
    );
    const updated = unwrap(await update({ endsOn: '2027-07-01' }));
    expect(updated.endsOn).toBe('2027-07-01');
  });

  describe('a finished tournament (R-21, R-22)', () => {
    // No game, an end date in the past: every game is scored, vacuously.
    const finished = async () =>
      unwrap(
        await createTournament(
          db,
          entry({ slug: 'old-one', name: 'Sena', endsOn: '2026-01-01' }),
        ),
      );

    it('update (ruled): a changed end date, survival or deadline round is refused, nothing written', async () => {
      const old = await finished();
      for (const change of [
        { endsOn: '2027-01-01' },
        { survival: false },
        { standingsDeadlineRound: roundNo(6) },
      ]) {
        expect(
          await update(
            { slug: 'old-one', name: 'Sena', endsOn: '2026-01-01', ...change },
            { tournament: old },
          ),
        ).toEqual({ ok: false, refusal: 'tournament-finished' });
      }
      expect(
        (
          await client.query(
            'select ends_on::text as ends_on, survival, standings_deadline_round from tournaments where id = $1',
            [old.id],
          )
        ).rows,
      ).toEqual([
        {
          ends_on: '2026-01-01',
          survival: true,
          standings_deadline_round: null,
        },
      ]);
    });

    it('update (ruled): the name, description, public switch, status and start date still change', async () => {
      const old = await finished();
      const updated = await update(
        {
          slug: 'old-one',
          name: 'Sena (baigta)',
          endsOn: '2026-01-01',
          description: 'Baigta',
          isPublic: false,
          status: 'upcoming',
          startsOn: '2025-10-01',
        },
        { tournament: old },
      );
      expect(updated.ok && updated.value.name).toBe('Sena (baigta)');
    });

    it('update (sportbet): nothing is frozen, so the end date changes', async () => {
      const old = await finished();
      const updated = await update(
        { slug: 'old-one', name: 'Sena', endsOn: '2027-01-01' },
        { tournament: old, rules: sportbetRules },
      );
      expect(updated.ok && updated.value.endsOn).toBe('2027-01-01');
    });
  });

  it('update: a tournament lock held past 5 s fails the update cleanly (lock_not_available), writing nothing', async () => {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock($1::int, $2::int)', [
        RECALCULATION_LOCK_NAMESPACE,
        TOURNAMENT.id,
      ]);
      await expect(update({ name: 'Kita' })).rejects.toMatchObject({
        cause: { code: '55P03' },
      });
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(
      (
        await client.query('select name from tournaments where id = $1', [
          TOURNAMENT.id,
        ])
      ).rows,
    ).toEqual([{ name: TOURNAMENT.name }]);
  }, 15_000);
});

describe('the admin`s tournament', () => {
  beforeEach(async () => {
    await savePlayers(db, [testPlayer(ADMIN, 'ada')]);
    await savePlayerSettings(db, [
      { player: ADMIN, locale: 'lt', role: 'superadmin', lastTournament: null },
    ]);
  });

  it('admin tournament: none until chosen', async () => {
    expect(await loadAdminTournament(db, ADMIN)).toBeNull();
  });

  it('admin tournament: the choice is stored with the account and survives', async () => {
    expect(await chooseAdminTournament(db, ADMIN, TOURNAMENT.id)).toEqual({
      ok: true,
      value: null,
    });
    expect(await loadAdminTournament(db, ADMIN)).toEqual(TOURNAMENT);
  });

  it('admin tournament: a later choice replaces it, and the last-used tournament is untouched', async () => {
    const other = unwrap(await createTournament(db, entry()));
    await chooseAdminTournament(db, ADMIN, TOURNAMENT.id);
    await chooseAdminTournament(db, ADMIN, other.id);
    expect((await loadAdminTournament(db, ADMIN))?.id).toBe(other.id);
    expect(
      (
        await client.query(
          'select last_tournament_id from player_settings where player_id = 1',
        )
      ).rows,
    ).toEqual([{ last_tournament_id: null }]);
  });

  it('admin tournament: a tournament that does not exist is refused', async () => {
    expect(await chooseAdminTournament(db, ADMIN, 99)).toEqual({
      ok: false,
      refusal: 'no-tournament',
    });
    expect(await loadAdminTournament(db, ADMIN)).toBeNull();
  });

  it('admin tournament: a deleted tournament reads as none', async () => {
    const other = unwrap(await createTournament(db, entry()));
    await chooseAdminTournament(db, ADMIN, other.id);
    await client.query('delete from leagues where tournament_id = $1', [
      other.id,
    ]);
    await client.query('delete from tournaments where id = $1', [other.id]);
    expect(await loadAdminTournament(db, ADMIN)).toBeNull();
  });
});
