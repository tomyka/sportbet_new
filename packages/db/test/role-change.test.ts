// Slice 14 (R-26 amended, R-117): changeRole - one transaction that writes the
// role and the admin trail, with the last-superadmin guard held under a lock
// rather than a count.

import { type PlayerId, type Role } from '@sportbet/domain';
import { at, player, testPlayer } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { savePlayerSettings, savePlayers } from '../src';
import { changeRole } from '../src/account/role';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, CAI, rowsOf, saveWorld } from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');
const DAN = player('4');

const setRoles = (roles: Readonly<Record<string, Role>>) =>
  savePlayerSettings(
    db,
    Object.entries(roles).map(([id, role]) => ({
      player: player(id),
      locale: 'lt',
      role,
      lastTournament: null,
    })),
  );

/** ADA and BEN are superadmins, CAI a results manager, DAN a player. */
beforeEach(async () => {
  await saveWorld(db);
  await savePlayers(db, [testPlayer(DAN, 'dan')]);
  await setRoles({
    '1': 'superadmin',
    '2': 'superadmin',
    '3': 'results-manager',
    '4': 'player',
  });
});

const roles = async () =>
  rowsOf(
    await client.query(
      'select player_id, role::text as role from player_settings order by player_id',
    ),
  ).map((row) => [row['player_id'], row['role']]);

const trail = async () =>
  rowsOf(
    await client.query(
      `select actor_id, target_id, kind::text as kind, old_role::text as old_role,
              new_role::text as new_role, at
         from audit_admin_actions order by id`,
    ),
  );

const change = (actor: PlayerId, target: PlayerId, role: Role) =>
  changeRole(db, { actor, target, role, now: NOW });

describe('changeRole', () => {
  it('writes the role and one audit row, in one transaction', async () => {
    expect(await change(ADA, DAN, 'results-manager')).toEqual({
      ok: true,
      value: { player: DAN, from: 'player', to: 'results-manager' },
    });
    expect(await roles()).toEqual([
      [1, 'superadmin'],
      [2, 'superadmin'],
      [3, 'results-manager'],
      [4, 'results-manager'],
    ]);
    expect(await trail()).toEqual([
      {
        actor_id: 1,
        target_id: 4,
        kind: 'role_change',
        old_role: 'player',
        new_role: 'results-manager',
        at: new Date(NOW),
      },
    ]);
  });

  it.each([
    ['player', 'superadmin'],
    ['results-manager', 'player'],
    ['superadmin', 'results-manager'],
  ] as const)('takes a %s to %s', async (from, to) => {
    const target = from === 'player' ? DAN : from === 'superadmin' ? BEN : CAI;
    expect((await change(ADA, target, to)).ok).toBe(true);
    expect(
      (await trail()).map((row) => [row['old_role'], row['new_role']]),
    ).toEqual([[from, to]]);
  });

  it('refuses a results manager as the actor and writes nothing', async () => {
    expect(await change(CAI, DAN, 'superadmin')).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
    expect(await roles()).toEqual([
      [1, 'superadmin'],
      [2, 'superadmin'],
      [3, 'results-manager'],
      [4, 'player'],
    ]);
    expect(await trail()).toEqual([]);
  });

  it('refuses a player as the actor, even to take their own up', async () => {
    expect(await change(DAN, DAN, 'superadmin')).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
    expect(await trail()).toEqual([]);
  });

  it('refuses an actor whose account is gone', async () => {
    expect(await change(player('99'), DAN, 'superadmin')).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
  });

  it('refuses your own role, even as a superadmin, and writes nothing', async () => {
    expect(await change(ADA, ADA, 'player')).toEqual({
      ok: false,
      refusal: 'own-role',
    });
    expect(await change(ADA, ADA, 'superadmin')).toEqual({
      ok: false,
      refusal: 'own-role',
    });
    expect((await roles())[0]).toEqual([1, 'superadmin']);
    expect(await trail()).toEqual([]);
  });

  it('refuses the role the account already holds, and writes nothing', async () => {
    expect(await change(ADA, DAN, 'player')).toEqual({
      ok: false,
      refusal: 'same-role',
    });
    expect(await trail()).toEqual([]);
  });

  it('refuses an account that does not exist', async () => {
    expect(await change(ADA, player('99'), 'player')).toEqual({
      ok: false,
      refusal: 'no-such-account',
    });
    expect(await trail()).toEqual([]);
  });

  it('records each change with the roles it moved between, in order', async () => {
    await change(ADA, DAN, 'results-manager');
    await change(ADA, DAN, 'superadmin');
    expect(
      (await trail()).map((row) => [row['old_role'], row['new_role']]),
    ).toEqual([
      ['player', 'results-manager'],
      ['results-manager', 'superadmin'],
    ]);
  });
});

describe('changeRole under concurrency (the last-superadmin guard)', () => {
  /** Holds every superadmin's settings row, so two writers start together and take turns. */
  async function startedTogether<T>(
    writers: readonly (() => Promise<T>)[],
  ): Promise<T[]> {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query(
        "select player_id from player_settings where role = 'superadmin' order by player_id for update",
      );
      const running = writers.map((write) => write());
      await new Promise((done) => setTimeout(done, 400));
      await holder.query('commit');
      return await Promise.all(running);
    } finally {
      holder.release();
    }
  }

  it('two superadmins demoting each other at once leave exactly one', async () => {
    const results = await startedTogether([
      () => change(ADA, BEN, 'player'),
      () => change(BEN, ADA, 'player'),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, refusal: 'actor-not-superadmin' },
    ]);
    expect(
      await client.query(
        "select count(*)::int as n from player_settings where role = 'superadmin'",
      ),
    ).toMatchObject({ rows: [{ n: 1 }] });
    expect(await trail()).toHaveLength(1);
  });

  it('two superadmins demoting each other, the only two, never leave none', async () => {
    for (let round = 0; round < 3; round++) {
      await setRoles({ '1': 'superadmin', '2': 'superadmin' });
      await client.query('delete from audit_admin_actions');
      await Promise.all([
        change(ADA, BEN, 'results-manager'),
        change(BEN, ADA, 'results-manager'),
      ]);
      const left = await client.query(
        "select count(*)::int as n from player_settings where role = 'superadmin'",
      );
      expect(left.rows).toEqual([{ n: 1 }]);
    }
  });

  it('an actor demoted meanwhile is refused, and the account they meant to change is untouched', async () => {
    const holder = await client.connect();
    let running: ReturnType<typeof change>;
    try {
      await holder.query('begin');
      await holder.query(
        "update player_settings set role = 'player' where player_id = 1",
      );
      running = change(ADA, DAN, 'superadmin');
      await new Promise((done) => setTimeout(done, 400));
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await running).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
    expect((await roles())[3]).toEqual([4, 'player']);
    expect(await trail()).toEqual([]);
  });

  it('a target changed meanwhile is judged as it stands then', async () => {
    const holder = await client.connect();
    let running: ReturnType<typeof change>;
    try {
      await holder.query('begin');
      await holder.query(
        "update player_settings set role = 'results-manager' where player_id = 4",
      );
      running = change(ADA, DAN, 'results-manager');
      await new Promise((done) => setTimeout(done, 400));
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await running).toEqual({ ok: false, refusal: 'same-role' });
  });
});
