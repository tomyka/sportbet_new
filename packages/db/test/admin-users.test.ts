// Slice 14 (R-19, R-115): the users list - every account by id with its role
// and, in the admin's tournament, its hide and switch-off.

import { player, testPlayer } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { savePlayers, savePlayerSettings } from '../src';
import { findAdminUser, loadAdminUsers } from '../src/admin/users';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  OTHER,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();
const DAN = player('4');

/** ADA superadmin, CAI results manager; BEN plays both tournaments (hidden in the first), CAI the first (switched off), DAN none. */
beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await savePlayers(db, [testPlayer(DAN, 'dan')]);
  await savePlayerSettings(
    db,
    (
      [
        ['1', 'superadmin'],
        ['2', 'player'],
        ['3', 'results-manager'],
        ['4', 'player'],
      ] as const
    ).map(([id, role]) => ({
      player: player(id),
      locale: 'lt',
      role,
      lastTournament: null,
    })),
  );
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await savePlaying(db, OTHER, BEN);
  await client.query(
    'update tournament_players set admin_hidden = true where player_id = 2 and tournament_id = 3',
  );
  await client.query(
    'update tournament_players set switched_off = true where player_id = 3 and tournament_id = 3',
  );
});

describe('loadAdminUsers', () => {
  it('lists every account by id with its names, address and role', async () => {
    const users = await loadAdminUsers(db, TOURNAMENT.id);
    expect(
      users.map((user) => [user.id, user.username, user.email, user.role]),
    ).toEqual([
      ['1', 'ada', 'ada@example.test', 'superadmin'],
      ['2', 'ben', 'ben@example.test', 'player'],
      ['3', 'cai', 'cai@example.test', 'results-manager'],
      ['4', 'dan', 'dan@example.test', 'player'],
    ]);
    expect(users[0]).toMatchObject({ name: 'ada', surname: '' });
  });

  it("shows the hide and the switch-off of the admin's tournament, none for an account that does not play it", async () => {
    const users = await loadAdminUsers(db, TOURNAMENT.id);
    expect(users.map((user) => user.standing)).toEqual([
      { adminHidden: false, switchedOff: false },
      { adminHidden: true, switchedOff: false },
      { adminHidden: false, switchedOff: true },
      null,
    ]);
  });

  it('reads the other tournament as it stands there (R-115: a hide is per tournament)', async () => {
    const users = await loadAdminUsers(db, OTHER.id);
    expect(users.map((user) => user.standing)).toEqual([
      null,
      { adminHidden: false, switchedOff: false },
      null,
      null,
    ]);
  });

  it('with no tournament chosen, every account is listed with no standing', async () => {
    const users = await loadAdminUsers(db, null);
    expect(users).toHaveLength(4);
    expect(users.every((user) => user.standing === null)).toBe(true);
  });
});

describe('findAdminUser', () => {
  it("is the list's own row for that account, found by its id alone", async () => {
    const listed = await loadAdminUsers(db, null);
    for (const user of listed) {
      expect(await findAdminUser(db, user.id)).toEqual(user);
    }
  });

  it('finds one account with its role, for the confirmation page', async () => {
    expect(await findAdminUser(db, CAI)).toMatchObject({
      id: CAI,
      username: 'cai',
      email: 'cai@example.test',
      role: 'results-manager',
      standing: null,
    });
  });

  it('is null for an account that is gone', async () => {
    expect(await findAdminUser(db, player('99'))).toBeNull();
  });
});
