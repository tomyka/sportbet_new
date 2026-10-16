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
    expect(await confirmEmailChange(db, { player: ADA, pending: NEW })).toEqual(
      { ok: true, value: { old: 'ada@example.test' } },
    );
    expect(await stored(1)).toEqual([
      { email: 'ada.new@example.test', pending_email: null },
    ]);
  });

  it('signs in by the new address afterwards, and by the old one finds nothing (#41)', async () => {
    await requestEmailChange(db, { player: ADA, address: NEW });
    await confirmEmailChange(db, { player: ADA, pending: NEW });
    expect(await findAccountByEmail(db, NEW)).toEqual({
      player: ADA,
      email: NEW,
    });
    expect(
      await findAccountByEmail(db, address('ada@example.test')),
    ).toBeUndefined();
  });

  it('is none when nothing pends', async () => {
    expect(await confirmEmailChange(db, { player: ADA, pending: NEW })).toEqual(
      { ok: false, refusal: 'none' },
    );
    expect(await stored(1)).toMatchObject([{ email: 'ada@example.test' }]);
  });

  it('is none when the pending address changed since the code was claimed', async () => {
    await requestEmailChange(db, { player: ADA, address: NEW });
    await requestEmailChange(db, {
      player: ADA,
      address: address('ada.other@example.test'),
    });
    expect(await confirmEmailChange(db, { player: ADA, pending: NEW })).toEqual(
      { ok: false, refusal: 'none' },
    );
    expect(await stored(1)).toEqual([
      {
        email: 'ada@example.test',
        pending_email: 'ada.other@example.test',
      },
    ]);
  });

  it('is none for a player who is gone', async () => {
    expect(
      await confirmEmailChange(db, { player: player('99'), pending: NEW }),
    ).toEqual({ ok: false, refusal: 'none' });
  });

  it('is none after the change was cancelled', async () => {
    await requestEmailChange(db, { player: ADA, address: NEW });
    await cancelEmailChange(db, ADA);
    expect(await confirmEmailChange(db, { player: ADA, pending: NEW })).toEqual(
      { ok: false, refusal: 'none' },
    );
  });

  it('is taken when another account holds the address exactly, and keeps the pending one', async () => {
    const held = address('ben@example.test');
    await requestEmailChange(db, { player: ADA, address: held });
    expect(
      await confirmEmailChange(db, { player: ADA, pending: held }),
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
      await confirmEmailChange(db, { player: ADA, pending: spelling }),
    ).toEqual({ ok: false, refusal: 'taken' });
  });

  it('is not taken by the account itself: an address that folds like its own moves', async () => {
    const spelling = address('ádá@example.test');
    await requestEmailChange(db, { player: ADA, address: spelling });
    expect(
      (await confirmEmailChange(db, { player: ADA, pending: spelling })).ok,
    ).toBe(true);
  });

  it('lets one of two accounts racing for one address win, and the other is taken', async () => {
    const wanted = address('wanted@example.test');
    await requestEmailChange(db, { player: ADA, address: wanted });
    await requestEmailChange(db, { player: BEN, address: wanted });
    const results = await Promise.all([
      confirmEmailChange(db, { player: ADA, pending: wanted }),
      confirmEmailChange(db, { player: BEN, pending: wanted }),
    ]);
    expect(results.filter((each) => each.ok)).toHaveLength(1);
    expect(
      results.filter((each) => !each.ok && each.refusal === 'taken'),
    ).toHaveLength(1);
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
