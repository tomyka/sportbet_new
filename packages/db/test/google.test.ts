// Slice 19 (#40): players.google_id, findAccountByGoogleId, linkGoogleId and
// createAccount's Google door - the username derived under the registration
// lock, the address and the sub never adopted, deletion freeing the sub.

import { emailAddress, Game, googleId, type GoogleId } from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  roundNo,
  seededDice,
  testPlayer,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  advanceIdentitySequences,
  createAccount,
  findAccountByEmail,
  findAccountByGoogleId,
  linkGoogleId,
  savePlayers,
  savePlayerSettings,
  type NewGoogleAccount,
} from '../src';
import { deleteAccount } from '../src/account/deletion';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, OLY, REA, rowsOf, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const email = (typed: string) => unwrap(emailAddress(typed));
const sub = (text: string): GoogleId => unwrap(googleId(text));

const SUB_A = sub('104520385693274017345');
const SUB_B = sub('204520385693274017346');

const google = (
  over: Partial<NewGoogleAccount['google']> = {},
  tournament: string | null = null,
): NewGoogleAccount => ({
  google: {
    sub: SUB_A,
    email: email('jonas@example.lt'),
    name: 'Jonas Jonaitis',
    ...over,
  },
  tournament,
});

const create = (account: NewGoogleAccount = google()) =>
  createAccount(db, account, {
    now: NOW,
    dice: seededDice(3),
  });

const count = async (sql: string) =>
  z
    .array(z.object({ n: z.coerce.number() }))
    .parse((await client.query(sql)).rows)[0]?.n;

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [
    unwrap(
      Game.schedule({
        id: gameNo(11),
        round: roundNo(1),
        home: REA,
        away: OLY,
        tipOff: at('2026-12-01T18:00:00Z'),
      }),
    ),
  ]);
  await savePlayerSettings(
    db,
    [ADA, BEN].map((who) => ({
      player: who,
      locale: 'lt' as const,
      role: 'player' as const,
      lastTournament: null,
    })),
  );
  await advanceIdentitySequences(db);
});

const googleIdOf = async (id: number) =>
  rowsOf(
    await client.query('select google_id from players where id = $1', [id]),
  );

describe('findAccountByGoogleId', () => {
  it('finds the account linked to the sub, by exact equality', async () => {
    await linkGoogleId(db, { player: ADA, googleId: SUB_A });
    expect(await findAccountByGoogleId(db, SUB_A)).toEqual({ player: ADA });
  });

  it('finds nothing for a sub nobody holds', async () => {
    expect(await findAccountByGoogleId(db, SUB_A)).toBeUndefined();
  });

  it('keeps case: a sub differing only in case is another sub', async () => {
    await linkGoogleId(db, { player: ADA, googleId: sub('AbCd') });
    expect(await findAccountByGoogleId(db, sub('abcd'))).toBeUndefined();
    expect(await findAccountByGoogleId(db, sub('AbCd'))).toEqual({
      player: ADA,
    });
  });
});

describe('linkGoogleId', () => {
  it('links a fresh account, and only that account', async () => {
    expect(await linkGoogleId(db, { player: ADA, googleId: SUB_A })).toEqual({
      ok: true,
      value: 'linked',
    });
    expect(await googleIdOf(1)).toEqual([{ google_id: SUB_A }]);
    expect(await googleIdOf(2)).toEqual([{ google_id: null }]);
  });

  it('links the same sub twice: the second changes nothing', async () => {
    await linkGoogleId(db, { player: ADA, googleId: SUB_A });
    expect(await linkGoogleId(db, { player: ADA, googleId: SUB_A })).toEqual({
      ok: true,
      value: 'linked',
    });
    expect(await googleIdOf(1)).toEqual([{ google_id: SUB_A }]);
  });

  it('never overwrites: another sub is already-linked and the row is unchanged (R-135)', async () => {
    await linkGoogleId(db, { player: ADA, googleId: SUB_A });
    expect(await linkGoogleId(db, { player: ADA, googleId: SUB_B })).toEqual({
      ok: false,
      refusal: 'already-linked',
    });
    expect(await googleIdOf(1)).toEqual([{ google_id: SUB_A }]);
  });

  it('refuses a sub another account holds as taken, writing nothing', async () => {
    await linkGoogleId(db, { player: ADA, googleId: SUB_A });
    expect(await linkGoogleId(db, { player: BEN, googleId: SUB_A })).toEqual({
      ok: false,
      refusal: 'taken',
    });
    expect(await googleIdOf(2)).toEqual([{ google_id: null }]);
  });

  it('refuses a player that does not exist', async () => {
    expect(
      await linkGoogleId(db, { player: player('99'), googleId: SUB_A }),
    ).toEqual({ ok: false, refusal: 'unknown-player' });
  });

  it('leaves one winner when two accounts link one sub at once', async () => {
    const results = await Promise.all([
      linkGoogleId(db, { player: ADA, googleId: SUB_A }),
      linkGoogleId(db, { player: BEN, googleId: SUB_A }),
    ]);
    expect(results.filter((each) => each.ok)).toHaveLength(1);
    expect(
      await count(
        'select count(*) as n from players where google_id is not null',
      ),
    ).toBe(1);
  });

  it('leaves one sub when two Google accounts link one player at once', async () => {
    const results = await Promise.all([
      linkGoogleId(db, { player: ADA, googleId: SUB_A }),
      linkGoogleId(db, { player: ADA, googleId: SUB_B }),
    ]);
    expect(results.filter((each) => each.ok)).toHaveLength(1);
    expect(
      results.filter((each) => !each.ok && each.refusal === 'already-linked'),
    ).toHaveLength(1);
  });

  it('is refused by the CHECK when a sub holds a quote or is 256 long', async () => {
    for (const bad of ["a'b", 'a'.repeat(256), 'a b']) {
      await expect(
        client.query('update players set google_id = $1 where id = 1', [bad]),
      ).rejects.toThrow('players_google_id_format');
    }
  });

  it('never touches the address, the names or the pending address', async () => {
    const before = rowsOf(
      await client.query(
        'select email, name, surname, pending_email from players where id = 1',
      ),
    );
    await linkGoogleId(db, { player: ADA, googleId: SUB_A });
    expect(
      rowsOf(
        await client.query(
          'select email, name, surname, pending_email from players where id = 1',
        ),
      ),
    ).toEqual(before);
  });
});

describe("createAccount's Google door", () => {
  const row = async (id: string) =>
    rowsOf(
      await client.query(
        'select username, name, surname, email, google_id from players where id = $1',
        [id],
      ),
    );

  it('makes the account with the address, the sub, a username from the local part and the name split', async () => {
    const created = await create();
    expect(created).toEqual({
      ok: true,
      value: { player: player('4'), tournament: TOURNAMENT },
    });
    expect(await row('4')).toEqual([
      {
        username: 'jonas',
        name: 'Jonas',
        surname: 'Jonaitis',
        email: 'jonas@example.lt',
        google_id: SUB_A,
      },
    ]);
  });

  it('gives it the settings row of any account: player, lt, no last tournament', async () => {
    await create();
    expect(
      rowsOf(
        await client.query(
          'select role::text as role, locale, last_tournament_id from player_settings where player_id = 4',
        ),
      ),
    ).toEqual([{ role: 'player', locale: 'lt', last_tournament_id: null }]);
  });

  it('joins the open tournament like a registration, with a blank row per game', async () => {
    await create();
    expect(
      await count(
        'select count(*) as n from tournament_players where player_id = 4',
      ),
    ).toBe(1);
    expect(
      await count(
        'select count(*) as n from match_predictions where player_id = 4 and game_id = 11',
      ),
    ).toBe(1);
  });

  it('honours the intended tournament', async () => {
    const created = await create(google({}, TOURNAMENT.slug));
    expect(created.ok && created.value.tournament?.slug).toBe(TOURNAMENT.slug);
  });

  it('suffixes a username another account holds: jonas2', async () => {
    await client.query("update players set username = 'jonas' where id = 1");
    await create();
    expect(await row('4')).toMatchObject([{ username: 'jonas2' }]);
  });

  it('skips a held jonas2 for jonas3', async () => {
    await client.query("update players set username = 'jonas' where id = 1");
    await client.query("update players set username = 'jonas2' where id = 2");
    await create();
    expect(await row('4')).toMatchObject([{ username: 'jonas3' }]);
  });

  it('counts a username held by fold: Šarūnas holds sarunas', async () => {
    await client.query("update players set username = 'Šarūnas' where id = 1");
    await create(google({ email: email('sarunas@example.lt') }));
    expect(await row('4')).toMatchObject([{ username: 'sarunas2' }]);
  });

  it('cuts the longest local part an address can have to 251 characters', async () => {
    const created = await create(
      google({ email: email(`${'a'.repeat(253)}@x`) }),
    );
    expect(created.ok).toBe(true);
    const [made] = await row('4');
    expect(String(made?.['username'])).toBe('a'.repeat(251));
  });

  it('uses zaidejas for a local part that is no username, and splits a one-word name with no surname', async () => {
    await create(google({ email: email('　@example.lt'), name: 'Jonas' }));
    expect(await row('4')).toMatchObject([
      { username: 'zaidejas', name: 'Jonas', surname: '' },
    ]);
  });

  it('is taken for the address exactly, and writes nothing', async () => {
    const before = await count('select count(*) as n from players');
    expect(await create(google({ email: email('ada@example.test') }))).toEqual({
      ok: false,
      refusal: 'taken',
    });
    expect(await count('select count(*) as n from players')).toBe(before);
    expect(await count('select count(*) as n from player_settings')).toBe(2);
  });

  it('is taken for a folded spelling of an address: zukauskas against zukauskas with accents', async () => {
    await client.query(
      "update players set email = 'žukauskas@example.test' where id = 1",
    );
    expect(
      await create(google({ email: email('zukauskas@example.test') })),
    ).toEqual({ ok: false, refusal: 'taken' });
    expect(
      await findAccountByEmail(db, email('zukauskas@example.test')),
    ).toBeUndefined();
  });

  it('is taken for a sub an account already holds, writing nothing', async () => {
    await linkGoogleId(db, { player: ADA, googleId: SUB_A });
    expect(await create()).toEqual({ ok: false, refusal: 'taken' });
    expect(await count('select count(*) as n from players')).toBe(3);
  });

  it('leaves one account when two creations race for one address', async () => {
    const results = await Promise.all([
      create(google({ sub: SUB_A })),
      create(google({ sub: SUB_B })),
    ]);
    expect(results.filter((each) => each.ok)).toHaveLength(1);
    expect(
      await count(
        "select count(*) as n from players where email = 'jonas@example.lt'",
      ),
    ).toBe(1);
  });

  it('leaves one account when two creations race for one sub', async () => {
    const results = await Promise.all([
      create(google({ email: email('one@example.lt') })),
      create(google({ email: email('two@example.lt') })),
    ]);
    expect(results.filter((each) => each.ok)).toHaveLength(1);
    expect(
      await count(
        `select count(*) as n from players where google_id = '${SUB_A}'`,
      ),
    ).toBe(1);
  });

  it('does not touch the form door: a form account has no google_id', async () => {
    const created = await createAccount(
      db,
      {
        username: 'naujoke',
        name: 'Rūta',
        surname: 'Naujokė',
        email: email('ruta@example.lt'),
        tournament: null,
      },
      { now: NOW, dice: seededDice(3) },
    );
    expect(created.ok).toBe(true);
    expect(await googleIdOf(4)).toEqual([{ google_id: null }]);
  });
});

describe('deleteAccount and the Google link', () => {
  it('frees the sub: the same Google account can sign up again', async () => {
    const created = await create();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await savePlayers(db, [testPlayer(player('90'), 'root')]);
    await savePlayerSettings(db, [
      {
        player: player('90'),
        locale: 'lt',
        role: 'superadmin',
        lastTournament: null,
      },
    ]);
    const deleted = await deleteAccount(db, {
      target: created.value.player,
      by: 'self',
      now: NOW,
    });
    expect(deleted.ok).toBe(true);
    expect(await findAccountByGoogleId(db, SUB_A)).toBeUndefined();
    await advanceIdentitySequences(db);
    expect((await create()).ok).toBe(true);
  });
});
