import {
  emailAddress,
  secondsAfter,
  type LoginCodePurpose,
} from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { claimLoginCode, findLiveLoginCode, issueLoginCode } from '../src';
import { useTestDatabase } from '../src/testing';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const ADA = unwrap(emailAddress('ada@example.lt'));
const ZUK = unwrap(emailAddress('žukauskas@example.lt'));
const ZUK_ASCII = unwrap(emailAddress('zukauskas@example.lt'));

const issue = (
  email = ADA,
  hash = 'hash-1',
  now = NOW,
  purpose: LoginCodePurpose = 'login',
) => issueLoginCode(db, { email, purpose, codeHash: hash, now });

const live = z.array(z.object({ live: z.int() }));
const liveCount = async () =>
  live.parse(
    (
      await client.query(
        'select count(*)::int as live from login_codes where consumed_at is null',
      )
    ).rows,
  )[0]?.live;

describe('issueLoginCode', () => {
  it('stores the hash, never the code, and an expiry five minutes on', async () => {
    await issue();
    const rows = await client.query(
      `select email, purpose, code_hash, created_at, expires_at, consumed_at from login_codes`,
    );
    expect(rows.rows).toEqual([
      {
        email: 'ada@example.lt',
        purpose: 'login',
        code_hash: 'hash-1',
        created_at: new Date('2026-10-05T12:00:00Z'),
        expires_at: new Date('2026-10-05T12:05:00Z'),
        consumed_at: null,
      },
    ]);
  });

  it('voids the live code of the same address and purpose: a new code supersedes it', async () => {
    await issue(ADA, 'hash-1');
    await issue(ADA, 'hash-2', secondsAfter(NOW, 30));
    expect(
      (await findLiveLoginCode(db, ADA, 'login', secondsAfter(NOW, 31)))
        ?.codeHash,
    ).toBe('hash-2');
    expect(await liveCount()).toBe(1);
  });

  it("never voids another address's code, not even one equal once accents are dropped (#41)", async () => {
    await issue(ZUK, 'hash-zuk');
    await issue(ZUK_ASCII, 'hash-ascii');
    expect((await findLiveLoginCode(db, ZUK, 'login', NOW))?.codeHash).toBe(
      'hash-zuk',
    );
  });

  it("never voids another purpose's code (#43)", async () => {
    await issue(ADA, 'hash-registration', NOW, 'registration');
    await issue(ADA, 'hash-login');
    expect(
      (await findLiveLoginCode(db, ADA, 'registration', NOW))?.codeHash,
    ).toBe('hash-registration');
  });

  it('leaves one live code when several are issued at once', async () => {
    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((hash) => issue(ADA, hash)),
    );
    expect(await liveCount()).toBe(1);
  });
});

describe('findLiveLoginCode', () => {
  it('finds nothing once the code has expired', async () => {
    await issue();
    expect(
      await findLiveLoginCode(db, ADA, 'login', secondsAfter(NOW, 299)),
    ).toBeDefined();
    expect(
      await findLiveLoginCode(db, ADA, 'login', secondsAfter(NOW, 300)),
    ).toBeUndefined();
  });

  it('finds nothing for another purpose or under the ASCII spelling', async () => {
    await issue(ZUK);
    expect(
      await findLiveLoginCode(db, ZUK, 'account_deletion', NOW),
    ).toBeUndefined();
    expect(
      await findLiveLoginCode(db, ZUK_ASCII, 'login', NOW),
    ).toBeUndefined();
  });
});

describe('claimLoginCode', () => {
  it('claims a live code once, and never again', async () => {
    await issue();
    const code = await findLiveLoginCode(db, ADA, 'login', NOW);
    if (code === undefined) throw new Error('no live code');
    expect(await claimLoginCode(db, code.id, NOW)).toBe(true);
    expect(await claimLoginCode(db, code.id, NOW)).toBe(false);
    expect(await findLiveLoginCode(db, ADA, 'login', NOW)).toBeUndefined();
  });

  it('never claims a code that expired between finding it and claiming it', async () => {
    await issue();
    const code = await findLiveLoginCode(
      db,
      ADA,
      'login',
      secondsAfter(NOW, 299),
    );
    if (code === undefined) throw new Error('no live code');
    expect(await claimLoginCode(db, code.id, secondsAfter(NOW, 300))).toBe(
      false,
    );
  });

  it('lets exactly one of two racing claims win', async () => {
    await issue();
    const code = await findLiveLoginCode(db, ADA, 'login', NOW);
    if (code === undefined) throw new Error('no live code');
    const won = await Promise.all([
      claimLoginCode(db, code.id, NOW),
      claimLoginCode(db, code.id, NOW),
    ]);
    expect(won.filter(Boolean)).toHaveLength(1);
  });
});
