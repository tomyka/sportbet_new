// The address change (slice 17, R-24, #41): parked, confirmed under the
// player row lock, cancelled. An address is an identity: sign-in finds an
// account by the exact address only.

import { emailAddress } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cancelEmailChange,
  confirmEmailChange,
  findAccountByEmail,
  requestEmailChange,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, rowsOf, saveWorld } from './world';

const { db, client } = useTestDatabase();

const address = (typed: string) => unwrap(emailAddress(typed));
const NEW = address('ada.new@example.test');

beforeEach(async () => {
  await saveWorld(db);
});

const stored = async (id: number) =>
  rowsOf(
    await client.query(
      'select email, pending_email from players where id = $1',
      [id],
    ),
  );

describe('requestEmailChange', () => {
  it('parks the address and leaves the live one', async () => {
    await requestEmailChange(db, { player: ADA, address: NEW });
    expect(await stored(1)).toEqual([
      { email: 'ada@example.test', pending_email: 'ada.new@example.test' },
    ]);
  });

  it('parks only for that player, and a second request replaces the first', async () => {
    await requestEmailChange(db, { player: ADA, address: NEW });
    await requestEmailChange(db, {
      player: ADA,
      address: address('ada.again@example.test'),
    });
    expect(await stored(1)).toMatchObject([
      { pending_email: 'ada.again@example.test' },
    ]);
    expect(await stored(2)).toMatchObject([{ pending_email: null }]);
  });
});

describe('confirmEmailChange', () => {
  it('moves the address, clears the pending one and answers the old address', async () => {
    await requestEmailChange(db, { player: ADA, address: NEW });
    expect(
      await confirmEmailChange(db, {
        player: ADA,
        pending: NEW,
        keepSession: null,
      }),
    ).toEqual({
      ok: true,
      value: { old: 'ada@example.test', now: 'ada.new@example.test' },
    });
    expect(await stored(1)).toEqual([
      { email: 'ada.new@example.test', pending_email: null },
    ]);
  });

  it('signs in by the new address afterwards, and by the old one finds nothing (#41)', async () => {
    await requestEmailChange(db, { player: ADA, address: NEW });
    await confirmEmailChange(db, {
      player: ADA,
      pending: NEW,
      keepSession: null,
    });
    expect(await findAccountByEmail(db, NEW)).toEqual({
      player: ADA,
      email: NEW,
    });
    expect(
      await findAccountByEmail(db, address('ada@example.test')),
    ).toBeUndefined();
  });

  it('is none when nothing pends', async () => {
    expect(
      await confirmEmailChange(db, {
        player: ADA,
        pending: NEW,
        keepSession: null,
      }),
    ).toEqual({ ok: false, refusal: 'none' });
    expect(await stored(1)).toMatchObject([{ email: 'ada@example.test' }]);
  });

  it('is none when the pending address changed since the code was claimed', async () => {
    await requestEmailChange(db, { player: ADA, address: NEW });
    await requestEmailChange(db, {
      player: ADA,
      address: address('ada.other@example.test'),
    });
    expect(
      await confirmEmailChange(db, {
        player: ADA,
        pending: NEW,
        keepSession: null,
      }),
    ).toEqual({ ok: false, refusal: 'none' });
    expect(await stored(1)).toEqual([
      {
        email: 'ada@example.test',
        pending_email: 'ada.other@example.test',
      },
    ]);
  });

  it('is none for a player who is gone', async () => {
    expect(
      await confirmEmailChange(db, {
        player: player('99'),
        pending: NEW,
        keepSession: null,
      }),
    ).toEqual({ ok: false, refusal: 'none' });
  });

  it('is none after the change was cancelled', async () => {
    await requestEmailChange(db, { player: ADA, address: NEW });
    await cancelEmailChange(db, ADA);
    expect(
      await confirmEmailChange(db, {
        player: ADA,
        pending: NEW,
        keepSession: null,
      }),
    ).toEqual({ ok: false, refusal: 'none' });
  });

  it('is taken when another account holds the address exactly, and keeps the pending one', async () => {
    const held = address('ben@example.test');
    await requestEmailChange(db, { player: ADA, address: held });
    expect(
      await confirmEmailChange(db, {
        player: ADA,
        pending: held,
        keepSession: null,
      }),
    ).toEqual({ ok: false, refusal: 'taken' });
    expect(await stored(1)).toEqual([
      { email: 'ada@example.test', pending_email: 'ben@example.test' },
    ]);
  });

  it('is taken when another account holds a second spelling of it (email_fold)', async () => {
    await client.query(
      "update players set email = 'žukauskas@example.test' where id = 2",
    );
    const spelling = address('zukauskas@example.test');
    await requestEmailChange(db, { player: ADA, address: spelling });
    expect(
      await confirmEmailChange(db, {
        player: ADA,
        pending: spelling,
        keepSession: null,
      }),
    ).toEqual({ ok: false, refusal: 'taken' });
  });

  it('is not taken by the account itself: an address that folds like its own moves', async () => {
    const spelling = address('ádá@example.test');
    await requestEmailChange(db, { player: ADA, address: spelling });
    expect(
      (
        await confirmEmailChange(db, {
          player: ADA,
          pending: spelling,
          keepSession: null,
        })
      ).ok,
    ).toBe(true);
  });

  it('lets one of two accounts racing for one address win, and the other is taken', async () => {
    const wanted = address('wanted@example.test');
    await requestEmailChange(db, { player: ADA, address: wanted });
    await requestEmailChange(db, { player: BEN, address: wanted });
    const results = await Promise.all([
      confirmEmailChange(db, {
        player: ADA,
        pending: wanted,
        keepSession: null,
      }),
      confirmEmailChange(db, {
        player: BEN,
        pending: wanted,
        keepSession: null,
      }),
    ]);
    expect(results.filter((each) => each.ok)).toHaveLength(1);
    expect(
      results.filter((each) => !each.ok && each.refusal === 'taken'),
    ).toHaveLength(1);
  });
});

describe('confirmEmailChange: what leaves with the old address and the old sessions', () => {
  const session = (hash: string, id: number) =>
    client.query(
      `insert into sessions (token_hash, player_id, created_at, last_seen_at, expires_at)
       values ($1, $2, now(), now(), now() + interval '90 days')`,
      [hash, id],
    );
  const hashes = async () =>
    rowsOf(
      await client.query('select token_hash from sessions order by token_hash'),
    ).map((row) => row['token_hash']);

  it("ends every session of the account but the confirming browser's (R-132), and no other account's", async () => {
    await session('keep', 1);
    await session('other-1', 1);
    await session('other-2', 1);
    await session('bens', 2);
    await requestEmailChange(db, { player: ADA, address: NEW });
    expect(
      (
        await confirmEmailChange(db, {
          player: ADA,
          pending: NEW,
          keepSession: 'keep',
        })
      ).ok,
    ).toBe(true);
    expect(await hashes()).toEqual(['bens', 'keep']);
  });

  it('ends every session when no browser is kept', async () => {
    await session('a', 1);
    await requestEmailChange(db, { player: ADA, address: NEW });
    await confirmEmailChange(db, {
      player: ADA,
      pending: NEW,
      keepSession: null,
    });
    expect(await hashes()).toEqual([]);
  });

  it('keeps every session when the address is refused', async () => {
    await session('a', 1);
    const held = address('ben@example.test');
    await requestEmailChange(db, { player: ADA, address: held });
    await confirmEmailChange(db, {
      player: ADA,
      pending: held,
      keepSession: null,
    });
    expect(await hashes()).toEqual(['a']);
  });

  it("deletes the old address's codes of every purpose by exact equality, and not a second spelling's or the new address's (#41)", async () => {
    await client.query(
      `insert into login_codes (email, purpose, code_hash, created_at, expires_at) values
        ('ada@example.test', 'login', 'old-login', now(), now() + interval '5 minutes'),
        ('ada@example.test', 'account_deletion', 'old-del', now(), now() + interval '5 minutes'),
        ('ádá@example.test', 'login', 'twin', now(), now() + interval '5 minutes'),
        ('ben@example.test', 'login', 'bens', now(), now() + interval '5 minutes')`,
    );
    await requestEmailChange(db, { player: ADA, address: NEW });
    await confirmEmailChange(db, {
      player: ADA,
      pending: NEW,
      keepSession: null,
    });
    expect(
      rowsOf(
        await client.query(
          'select code_hash from login_codes order by code_hash',
        ),
      ).map((row) => row['code_hash']),
    ).toEqual(['bens', 'twin']);
  });
});

describe('cancelEmailChange', () => {
  it('drops the pending address of that player only, and the live one stays', async () => {
    await requestEmailChange(db, { player: ADA, address: NEW });
    await requestEmailChange(db, {
      player: BEN,
      address: address('ben.new@example.test'),
    });
    await cancelEmailChange(db, ADA);
    expect(await stored(1)).toEqual([
      { email: 'ada@example.test', pending_email: null },
    ]);
    expect(await stored(2)).toMatchObject([
      { pending_email: 'ben.new@example.test' },
    ]);
  });

  it('does nothing when nothing pends', async () => {
    await cancelEmailChange(db, ADA);
    expect(await stored(1)).toMatchObject([{ pending_email: null }]);
  });
});
