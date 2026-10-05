import { useTestDatabase } from '@sportbet/db/testing';
import { DAY_SECONDS, secondsAfter, utcDay } from '@sportbet/domain';
import { at } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SESSION_COOKIE, type CookieOptions } from '../../src/server/cookies';
import {
  currentPlayer,
  endSession,
  extendSession,
  startSession,
} from '../../src/server/session/session';
import { hashSessionToken } from '../../src/server/session/session-token';
import { JONAS_ACCOUNT, saveAccounts } from '../support/accounts';

// The web Session module (review A1) against the test database, with an
// in-memory cookie jar: what proxy.ts, /logout, verify and the request
// context each do through it. sign-in.test.ts and session.test.ts prove
// the same end to end through the built app.

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const NAME = SESSION_COOKIE.name;

interface Written {
  readonly value: string;
  readonly options: CookieOptions;
}

/** A browser's cookies for one request: what it sent, and what the response set. */
function jar(sent?: string) {
  const written: Written[] = [];
  return {
    written,
    get: (name: string) =>
      name === NAME && sent !== undefined ? { value: sent } : undefined,
    set: (name: string, value: string, options: CookieOptions) => {
      if (name === NAME) written.push({ value, options });
    },
  };
}

const sessionRows = async () =>
  z
    .array(z.object({ token_hash: z.string(), expires_at: z.date() }))
    .parse(
      (await client.query('select token_hash, expires_at from sessions')).rows,
    );

/** Starts a session on `day` and returns the cookie value it set. */
async function started(when = NOW): Promise<string> {
  const cookies = jar();
  await startSession(db, cookies, JONAS_ACCOUNT.id, when);
  const value = cookies.written[0]?.value;
  if (value === undefined) throw new Error('no cookie');
  return value;
}

beforeEach(async () => {
  await saveAccounts(db, [JONAS_ACCOUNT]);
});

describe('start', () => {
  it("sets the cookie to a fresh token and today's UTC day, with the session cookie's flags, and stores only the token's hash", async () => {
    const cookies = jar();
    await startSession(db, cookies, JONAS_ACCOUNT.id, NOW);
    expect(cookies.written).toHaveLength(1);
    const [{ value, options } = { value: '', options: undefined }] =
      cookies.written;
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}\.2026-10-05$/);
    expect(options).toEqual(SESSION_COOKIE.options);
    const token = value.split('.')[0] ?? '';
    expect((await sessionRows()).map((row) => row.token_hash)).toEqual([
      hashSessionToken(token),
    ]);
  });
});

describe('current', () => {
  it('reads the player a live session names', async () => {
    const value = await started();
    expect(await currentPlayer(db, jar(value), NOW)).toMatchObject({
      player: JONAS_ACCOUNT.id,
      name: 'Jonas',
    });
  });

  it('reads no one from no cookie, a cookie that is not one, an unknown token or an ended session', async () => {
    expect(await currentPlayer(db, jar(), NOW)).toBeNull();
    expect(await currentPlayer(db, jar('nonsense'), NOW)).toBeNull();
    const unknown = `${'A'.repeat(43)}.2026-10-05`;
    expect(await currentPlayer(db, jar(unknown), NOW)).toBeNull();
    const value = await started();
    const later = secondsAfter(NOW, 91 * DAY_SECONDS);
    expect(await currentPlayer(db, jar(value), later)).toBeNull();
  });
});

describe('extend (R-44)', () => {
  it('on the day the cookie was issued, writes nothing anywhere', async () => {
    const value = await started();
    const [before] = await sessionRows();
    const response = jar();
    await extendSession(db, jar(value), response, secondsAfter(NOW, 3600));
    expect(response.written).toEqual([]);
    expect(await sessionRows()).toEqual([before]);
  });

  it('on a later day, extends the session to 90 days on and re-issues the cookie for that day', async () => {
    const value = await started();
    const next = secondsAfter(NOW, 2 * DAY_SECONDS);
    const response = jar();
    await extendSession(db, jar(value), response, next);
    const token = value.split('.')[0] ?? '';
    expect(response.written).toEqual([
      { value: `${token}.${utcDay(next)}`, options: SESSION_COOKIE.options },
    ]);
    const [row] = await sessionRows();
    expect(row?.expires_at.getTime()).toBe(next + 90 * DAY_SECONDS * 1000);
  });

  it('clears a cookie whose session is over, or that is not one; leaves a request without one alone', async () => {
    const value = await started();
    for (const sent of [value, 'nonsense']) {
      const response = jar();
      await extendSession(
        db,
        jar(sent),
        response,
        secondsAfter(NOW, 91 * DAY_SECONDS),
      );
      expect(response.written).toEqual([
        { value: '', options: { ...SESSION_COOKIE.options, maxAge: 0 } },
      ]);
    }
    const none = jar();
    await extendSession(db, jar(), none, NOW);
    expect(none.written).toEqual([]);
  });
});

describe('end', () => {
  it("deletes this browser's session and clears its cookie", async () => {
    const value = await started();
    const other = await started();
    const response = jar();
    await endSession(db, jar(value), response);
    expect(response.written).toEqual([
      { value: '', options: { ...SESSION_COOKIE.options, maxAge: 0 } },
    ]);
    // Q3: this device only.
    expect(await currentPlayer(db, jar(other), NOW)).not.toBeNull();
    expect(await sessionRows()).toHaveLength(1);
  });

  it('clears the cookie even with no session to delete', async () => {
    const response = jar();
    await endSession(db, jar(), response);
    expect(response.written).toHaveLength(1);
  });
});
