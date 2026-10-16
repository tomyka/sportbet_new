// loadProfile and updateProfileNames (slice 17, #34): what /userProfile reads,
// and the names that take effect at once (sportbet issue 265: a username
// another account holds is refused).

import { emailAddress, type StoredPlayer } from '@sportbet/domain';
import { at, player, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  isUsernameHeld,
  loadProfile,
  savePlayers,
  savePlayerSettings,
  setReceiveReminders,
  updateProfileNames,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, rowsOf, saveWorld } from './world';

const { db, client } = useTestDatabase();

const SARUNAS: StoredPlayer = {
  id: player('9'),
  username: 'Šarūnas',
  email: unwrap(emailAddress('sarunas@example.lt')),
  name: 'Šarūnas',
  surname: 'Jonaitis',
};

beforeEach(async () => {
  await saveWorld(db);
  await savePlayers(db, [SARUNAS]);
  await savePlayerSettings(
    db,
    [ADA, BEN, SARUNAS.id].map((who) => ({
      player: who,
      locale: 'lt' as const,
      role: who === ADA ? ('superadmin' as const) : ('player' as const),
      lastTournament: null,
    })),
  );
});

describe('loadProfile', () => {
  it('reads the account, its role, reminder switch and creation moment', async () => {
    await client.query(
      "update players set created_at = '2025-03-04T10:20:30Z', pending_email = 'ada.new@example.test' where id = 1",
    );
    await setReceiveReminders(db, { player: ADA, on: true });
    expect(await loadProfile(db, ADA)).toEqual({
      username: 'ada',
      name: 'ada',
      surname: '',
      email: 'ada@example.test',
      pendingEmail: 'ada.new@example.test',
      role: 'superadmin',
      receiveReminders: true,
      createdAt: at('2025-03-04T10:20:30Z'),
    });
  });

  it('has no pending address and no reminders by default, and the role of a plain player', async () => {
    expect(await loadProfile(db, BEN)).toMatchObject({
      pendingEmail: null,
      receiveReminders: false,
      role: 'player',
    });
  });

  it('reads nothing for a player that does not exist', async () => {
    expect(await loadProfile(db, player('99'))).toBeUndefined();
  });

  it('stamps a new account with the moment it was made', async () => {
    const created = await loadProfile(db, SARUNAS.id);
    expect(created).toBeDefined();
    const { rows } = await client.query<{ seconds: number }>(
      'select extract(epoch from now() - created_at)::float as seconds from players where id = 9',
    );
    expect(rows[0]?.seconds).toBeLessThan(60);
  });
});

describe('updateProfileNames', () => {
  const stored = async (id: number) =>
    rowsOf(
      await client.query(
        'select username, name, surname, email, pending_email from players where id = $1',
        [id],
      ),
    );

  it('changes the username, name and surname, and nothing else', async () => {
    expect(
      await updateProfileNames(db, {
        player: BEN,
        username: 'benas',
        name: 'Benas',
        surname: 'Benaitis',
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(await stored(2)).toEqual([
      {
        username: 'benas',
        name: 'Benas',
        surname: 'Benaitis',
        email: 'ben@example.test',
        pending_email: null,
      },
    ]);
  });

  it('is no collision with oneself: the same username saved again', async () => {
    expect(
      (
        await updateProfileNames(db, {
          player: ADA,
          username: 'ada',
          name: 'Augusta',
          surname: 'Byron',
        })
      ).ok,
    ).toBe(true);
    expect(await stored(1)).toMatchObject([{ name: 'Augusta' }]);
  });

  it.each([
    ['the same text', 'Šarūnas'],
    ['the accents dropped', 'Sarunas'],
    ['another case', 'ŠARŪNAS'],
    ['a trailing space', 'sarunas '],
  ])('refuses a username another account holds: %s', async (_label, wanted) => {
    expect(
      await updateProfileNames(db, {
        player: BEN,
        username: wanted,
        name: 'Ben',
        surname: 'Benaitis',
      }),
    ).toEqual({ ok: false, refusal: 'username-taken' });
    expect(await stored(2)).toMatchObject([{ username: 'ben', name: 'ben' }]);
  });

  it('refuses a player who is gone', async () => {
    expect(
      await updateProfileNames(db, {
        player: player('99'),
        username: 'niekas',
        name: 'N',
        surname: 'N',
      }),
    ).toEqual({ ok: false, refusal: 'unknown-player' });
  });
});

describe('updateProfileNames and the registration lock (issue 265)', () => {
  it('writes an unchanged username without waiting for the registration lock', async () => {
    const holder = await client.query('begin');
    expect(holder.command).toBe('BEGIN');
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended('registration', 0))",
    );
    try {
      const saved = await Promise.race([
        updateProfileNames(db, {
          player: ADA,
          username: 'ada',
          name: 'Augusta',
          surname: 'Byron',
        }),
        new Promise<'blocked'>((done) =>
          setTimeout(() => {
            done('blocked');
          }, 3000),
        ),
      ]);
      expect(saved).toEqual({ ok: true, value: undefined });
    } finally {
      await client.query('rollback');
    }
  });

  it('compares a changed username in the domain fold for everyone else, and its own old spelling is no collision', async () => {
    expect(
      await updateProfileNames(db, {
        player: BEN,
        username: 'BEN',
        name: 'Ben',
        surname: 'B',
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(await isUsernameHeld(db, 'ben', BEN)).toBe(false);
    expect(await isUsernameHeld(db, 'ben')).toBe(true);
    expect(await isUsernameHeld(db, 'sarunas')).toBe(true);
    expect(await isUsernameHeld(db, 'nobody')).toBe(false);
  });
});
