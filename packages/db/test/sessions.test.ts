import { secondsAfter } from '@sportbet/domain';
import { at } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSession,
  deleteSession,
  findSignedInPlayer,
  recordLogin,
  savePlayerSettings,
  touchSession,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const DAY = 86_400;
const HASH = 'a'.repeat(64);

beforeEach(async () => {
  await saveWorld(db);
  await savePlayerSettings(db, [
    { player: ADA, locale: 'lt', adminLevel: 9, lastTournament: TOURNAMENT.id },
  ]);
  await createSession(db, { player: ADA, tokenHash: HASH, now: NOW });
});

describe('a session', () => {
  it('holds the token only as its hash, and names its player, with what the shell shows', async () => {
    expect(await findSignedInPlayer(db, HASH, NOW)).toEqual({
      player: ADA,
      name: 'ada',
      surname: '',
      adminLevel: 9,
      lastTournament: TOURNAMENT.id,
    });
    const rows = await client.query(
      'select token_hash, created_at, last_seen_at, expires_at from sessions',
    );
    expect(rows.rows).toEqual([
      {
        token_hash: HASH,
        created_at: new Date('2026-10-05T12:00:00Z'),
        last_seen_at: new Date('2026-10-05T12:00:00Z'),
        expires_at: new Date('2027-01-03T12:00:00Z'),
      },
    ]);
  });

  it('R-44: ends 90 days after its last visit', async () => {
    expect(
      await findSignedInPlayer(db, HASH, secondsAfter(NOW, 90 * DAY - 1)),
    ).toBeDefined();
    expect(
      await findSignedInPlayer(db, HASH, secondsAfter(NOW, 90 * DAY)),
    ).toBeUndefined();
  });

  it('R-44: a visit extends it to 90 days from that visit', async () => {
    const visit = secondsAfter(NOW, 60 * DAY);
    expect(await touchSession(db, HASH, visit)).toBe(true);
    expect(
      await findSignedInPlayer(db, HASH, secondsAfter(visit, 90 * DAY - 1)),
    ).toBeDefined();
    const rows = await client.query(
      'select last_seen_at, expires_at from sessions',
    );
    expect(rows.rows).toEqual([
      {
        last_seen_at: new Date('2026-12-04T12:00:00Z'),
        expires_at: new Date('2027-03-04T12:00:00Z'),
      },
    ]);
  });

  it('is never revived once it has ended, and an unknown token touches nothing', async () => {
    expect(await touchSession(db, HASH, secondsAfter(NOW, 90 * DAY))).toBe(
      false,
    );
    expect(await touchSession(db, 'b'.repeat(64), NOW)).toBe(false);
    expect(
      await findSignedInPlayer(db, HASH, secondsAfter(NOW, 90 * DAY)),
    ).toBeUndefined();
  });

  it('ends when it is deleted, and only that one', async () => {
    await createSession(db, {
      player: ADA,
      tokenHash: 'c'.repeat(64),
      now: NOW,
    });
    await deleteSession(db, HASH);
    expect(await findSignedInPlayer(db, HASH, NOW)).toBeUndefined();
    expect(await findSignedInPlayer(db, 'c'.repeat(64), NOW)).toBeDefined();
  });

  it('throws for a player with no settings row: every account has one', async () => {
    await createSession(db, {
      player: BEN,
      tokenHash: 'd'.repeat(64),
      now: NOW,
    });
    await expect(findSignedInPlayer(db, 'd'.repeat(64), NOW)).rejects.toThrow(
      /player 2 has no player_settings row/,
    );
  });
});

it('records a sign-in by its method and moment', async () => {
  await recordLogin(db, { player: ADA, method: 'email_code', at: NOW });
  const rows = await client.query(
    'select player_id, method, at from audit_logins',
  );
  expect(rows.rows).toEqual([
    {
      player_id: 1,
      method: 'email_code',
      at: new Date('2026-10-05T12:00:00Z'),
    },
  ]);
});

it("records a registration as 'register' (RegisteredUserController::confirm), without the IP (R-45)", async () => {
  await recordLogin(db, { player: ADA, method: 'register', at: NOW });
  const rows = await client.query('select * from audit_logins');
  expect(rows.rows).toEqual([
    {
      id: 1,
      player_id: 1,
      method: 'register',
      at: new Date('2026-10-05T12:00:00Z'),
    },
  ]);
});
