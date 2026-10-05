import { emailAddress, secondsAfter } from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  attemptRateLimit,
  createSession,
  issueLoginCode,
  pruneSignInState,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { ADA, saveWorld } from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const attempt = (seconds: number, key = 'k') =>
  attemptRateLimit(db, {
    key,
    maxAttempts: 3,
    windowSeconds: 600,
    now: secondsAfter(NOW, seconds),
  });

describe('attemptRateLimit', () => {
  it('allows the maximum, then refuses with the seconds left in the window', async () => {
    expect(await attempt(0)).toEqual({ allowed: true });
    expect(await attempt(10)).toEqual({ allowed: true });
    expect(await attempt(20)).toEqual({ allowed: true });
    expect(await attempt(30)).toEqual({
      allowed: false,
      retryAfterSeconds: 570,
    });
  });

  it('opens the window at the first hit, and a refused attempt does not count: once it lapses, the count starts again', async () => {
    for (const second of [0, 300, 590]) await attempt(second);
    expect(await attempt(599)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(await attempt(600)).toEqual({ allowed: true });
    expect(await attempt(601)).toEqual({ allowed: true });
    expect(await attempt(602)).toEqual({ allowed: true });
    expect(await attempt(603)).toEqual({
      allowed: false,
      retryAfterSeconds: 597,
    });
  });

  it('keeps each key to itself', async () => {
    for (const second of [0, 1, 2]) await attempt(second, 'one');
    expect(await attempt(3, 'one')).toMatchObject({ allowed: false });
    expect(await attempt(3, 'two')).toEqual({ allowed: true });
  });

  it('never allows more than the maximum, however many arrive at once', async () => {
    const verdicts = await Promise.all(
      Array.from({ length: 10 }, () => attempt(0)),
    );
    expect(verdicts.filter(({ allowed }) => allowed)).toHaveLength(3);
  });
});

it('prunes windows and codes past a day and sessions that have ended, and keeps the rest', async () => {
  await saveWorld(db);
  const email = unwrap(emailAddress('ada@example.test'));
  await attempt(0, 'old');
  await attemptRateLimit(db, {
    key: 'new',
    maxAttempts: 3,
    windowSeconds: 600,
    now: secondsAfter(NOW, 2 * 86_400),
  });
  await issueLoginCode(db, {
    email,
    purpose: 'login',
    codeHash: 'old',
    now: NOW,
  });
  await issueLoginCode(db, {
    email,
    purpose: 'registration',
    codeHash: 'new',
    now: secondsAfter(NOW, 2 * 86_400),
  });
  await createSession(db, { player: ADA, tokenHash: 'a'.repeat(64), now: NOW });
  await createSession(db, {
    player: ADA,
    tokenHash: 'b'.repeat(64),
    now: secondsAfter(NOW, 2 * 86_400),
  });
  await pruneSignInState(db, secondsAfter(NOW, 91 * 86_400));
  const left = await client.query(
    `select (select string_agg(key, ',') from rate_limits) as windows,
            (select string_agg(code_hash, ',') from login_codes) as codes,
            (select string_agg(left(token_hash, 1), ',') from sessions) as sessions`,
  );
  expect(
    z
      .array(
        z.object({
          windows: z.string().nullable(),
          codes: z.string().nullable(),
          sessions: z.string().nullable(),
        }),
      )
      .parse(left.rows),
  ).toEqual([{ windows: null, codes: null, sessions: 'b' }]);
});
