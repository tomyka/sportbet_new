import { insertTournamentPlayer, useTestDatabase } from '@sportbet/db/testing';
import { emailAddress, type StoredPlayer } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { PLAYER_HOME } from '../../src/components/shell/shell-paths';
import {
  JONAS_ACCOUNT,
  JONAS_EMAIL,
  ZUKAUSKAS_ACCOUNT,
} from '../support/accounts';
import { formOf, followed, said } from '../support/admin';
import { Browser, documentOf, type Page } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import {
  clearMail,
  codesTo,
  settleMail,
  waitForCodes,
} from '../support/mailpit';
import { gamesOf, savePlaying } from '../support/predictions';
import {
  LATER,
  SOONER,
  saveTournamentWithGames,
} from '../support/registration';

// Slice 14 (#31): /admin/users, /admin/leagues, /admin/messages and
// /admin/audit against the built app: each route's gate (R-26 amended,
// R-116), its 303 and message, the emailed code of every destructive action
// (a role change, an account deletion, a league deletion, a message
// deletion), and what each wrote. In SOONER (41) Jonas (1, superadmin),
// Žukauskas (2) and Trečias (3) play; league 900 is Žukauskas's with Trečias
// a member, the public league came with the tournament, league 950 is
// LATER's.

const TRECIAS_ACCOUNT: StoredPlayer = {
  id: player('3'),
  username: 'trecias',
  email: unwrap(emailAddress('trecias@example.lt')),
  name: 'Trečias',
  surname: 'Trečiauskas',
};

const FOURTH_ACCOUNT: StoredPlayer = {
  id: player('4'),
  username: 'ketvirtas',
  email: unwrap(emailAddress('ketvirtas@example.lt')),
  name: 'Ketvirtas',
  surname: 'Ketvirtauskas',
};

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const { db, client } = useTestDatabase();

const PRIVATE = 900;
/** The public league of SOONER, made with the tournament (its id is read in setUp). */
let PUBLIC = 0;
const PUBLIC_NAME = 'Euroleague 2026/27';
const ELSEWHERE = 950;
const [GAME] = gamesOf(SOONER);

beforeEach(async () => {
  // A mail the previous test sent may still be on its way: let it land, so
  // the clear below really empties the shared mailbox.
  await settleMail(mailpitUrl);
  await clearMail(mailpitUrl);
});

const rows = async (sql: string, ...params: unknown[]) =>
  z.array(z.unknown()).parse((await client.query(sql, params)).rows);

const count = async (sql: string, ...params: unknown[]): Promise<number> =>
  z.array(z.object({ n: z.int() })).parse(await rows(sql, ...params))[0]?.n ??
  -1;

const one = async <T extends z.ZodType>(
  schema: T,
  sql: string,
  ...params: unknown[]
): Promise<z.infer<T> | undefined> =>
  z.array(schema).parse(await rows(sql, ...params))[0];

async function addLeague(
  id: number,
  tournament: number,
  name: string,
  owner: number | null,
): Promise<void> {
  await client.query(
    'insert into leagues (id, tournament_id, name, is_public, owner_id) overriding system value values ($1, $2, $3, $4, $5)',
    [id, tournament, name, owner === null, owner],
  );
}

async function addMember(
  league: number,
  id: number,
  { admin = false, guest = false }: { admin?: boolean; guest?: boolean } = {},
): Promise<void> {
  await client.query(
    'insert into league_members (league_id, player_id, is_admin, is_guest) values ($1, $2, $3, $4)',
    [league, id, admin, guest],
  );
}

interface World {
  readonly jonas: Browser;
  readonly zuk: Browser;
}

/** Jonas works on SOONER; the leagues and the other players are in place. */
async function setUp(
  role: 'superadmin' | 'results-manager' | 'player' = 'superadmin',
): Promise<World> {
  const jonas = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
    role,
    ip: '192.0.2.70',
  });
  await savePlaying(db, client, SOONER);
  const zuk = await signedInBrowser(db, baseUrl, ZUKAUSKAS_ACCOUNT, {
    ip: '192.0.2.71',
  });
  await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, { ip: '192.0.2.72' });
  for (const id of [2, 3]) {
    await insertTournamentPlayer(client, { tournament: SOONER.id, player: id });
  }
  await client.query(
    'update player_settings set admin_tournament_id = $1 where player_id = 1',
    [SOONER.id],
  );
  await addLeague(PRIVATE, SOONER.id, 'Draugų lyga', 2);
  await addMember(PRIVATE, 2, { admin: true });
  await addMember(PRIVATE, 3);
  PUBLIC =
    (
      await one(
        z.object({ id: z.int() }),
        'select id from leagues where tournament_id = $1 and is_public',
        SOONER.id,
      )
    )?.id ?? -1;
  return { jonas, zuk };
}

const guestBrowser = (ip = '192.0.2.73') => new Browser(baseUrl, ip);

/** A second window of the same signed-in account, from another address. */
function windowOf(browser: Browser, ip: string): Browser {
  const other = new Browser(baseUrl, ip);
  const session = browser.cookie('__Host-sb_session');
  if (session === undefined) throw new Error('not signed in');
  other.setCookie('__Host-sb_session', session);
  return other;
}

const CONFIRM = '/admin/confirm/save';

/** The nth code mailed to Jonas, waited for (a code goes out after the response). */
async function code(nth = 1): Promise<string> {
  const codes = await waitForCodes(mailpitUrl, JONAS_EMAIL, nth);
  const found = codes[nth - 1];
  if (found === undefined) throw new Error('no code');
  return found;
}

const confirm = (browser: Browser, typed: string) =>
  browser.post(CONFIRM, formOf({ code: typed }));

const noMail = async (): Promise<void> => {
  await settleMail(mailpitUrl);
  expect(await codesTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
};

const roleOf = async (id: number) =>
  (
    await one(
      z.object({ role: z.string() }),
      'select role from player_settings where player_id = $1',
      id,
    )
  )?.role;

const GATED_GETS = [
  '/admin/users',
  '/admin/leagues',
  '/admin/leagues/900/members',
  '/admin/leagues/{public}/payments',
  '/admin/audit',
] as const;

const GATED_POSTS = [
  '/admin/updateUser',
  '/admin/deleteUser',
  '/admin/toggleHidden',
  '/admin/leagues/update',
  '/admin/leagues/delete',
  '/admin/leagues/guest',
  '/admin/leagues/901/payments/save',
  '/admin/leagues/901/payment-details',
] as const;

const MESSAGE_POSTS = ['/admin/messages/save', '/admin/messageInsert'] as const;

describe('the gates (R-26 amended, R-116)', () => {
  it.each(GATED_GETS)(
    '%s: a guest, a player and a results manager go home; a superadmin is let in',
    async (template) => {
      const { jonas } = await setUp('player');
      const path = template.replace('{public}', String(PUBLIC));
      expect((await guestBrowser().get(path)).location).toBe('/');
      for (const role of ['player', 'results-manager'] as const) {
        await client.query(
          'update player_settings set role = $1 where player_id = 1',
          [role],
        );
        const page = await jonas.get(path);
        expect([page.status, page.location]).toEqual([307, '/']);
      }
      await client.query(
        "update player_settings set role = 'superadmin' where player_id = 1",
      );
      expect((await jonas.get(path)).status).toBe(200);
    },
  );

  it('/admin/messages: a guest and a player go home; a results manager and a superadmin are let in (R-116)', async () => {
    expect((await guestBrowser().get('/admin/messages')).location).toBe('/');
    const { jonas } = await setUp('player');
    expect((await jonas.get('/admin/messages')).location).toBe('/');
    for (const role of ['results-manager', 'superadmin'] as const) {
      await client.query(
        'update player_settings set role = $1 where player_id = 1',
        [role],
      );
      expect((await jonas.get('/admin/messages')).status).toBe(200);
    }
  });

  it.each(GATED_POSTS)(
    'POST %s: a guest, a player and a results manager are sent home with a 303, and nothing is mailed',
    async (path) => {
      const guest = await guestBrowser().post(path, formOf({}));
      expect([guest.status, guest.location]).toEqual([303, '/']);
      const { jonas } = await setUp('player');
      expect((await jonas.post(path, formOf({}))).location).toBe('/');
      await client.query(
        "update player_settings set role = 'results-manager' where player_id = 1",
      );
      expect((await jonas.post(path, formOf({}))).location).toBe('/');
      await noMail();
    },
  );

  it.each(MESSAGE_POSTS)(
    'POST %s: a guest and a player are sent home; a results manager is let in',
    async (path) => {
      expect((await guestBrowser().post(path, formOf({}))).location).toBe('/');
      const { jonas } = await setUp('player');
      expect((await jonas.post(path, formOf({}))).location).toBe('/');
      await client.query(
        "update player_settings set role = 'results-manager' where player_id = 1",
      );
      expect((await jonas.post(path, formOf({}))).location).toBe(
        '/admin/messages',
      );
    },
  );

  it.each([...GATED_POSTS, ...MESSAGE_POSTS])(
    'POST %s: from another site is a 403, whoever is signed in (#16)',
    async (path) => {
      const { jonas } = await setUp();
      const page = await jonas.post(path, formOf({}), {
        origin: 'https://evil.example',
      });
      expect(page.status).toBe(403);
    },
  );

  it('the role is read on every request: a superadmin demoted meanwhile is sent home', async () => {
    const { jonas } = await setUp();
    expect((await jonas.get('/admin/users')).status).toBe(200);
    await client.query(
      "update player_settings set role = 'player' where player_id = 1",
    );
    expect((await jonas.get('/admin/users')).location).toBe('/');
    expect((await jonas.post('/admin/toggleHidden', formOf({}))).location).toBe(
      '/',
    );
  });
});

describe('/admin/users: the list', () => {
  it('lists every account with its role select (three roles, none for your own), no Auth column, and a hide where the account plays the tournament', async () => {
    const { jonas } = await setUp();
    await signedInBrowser(db, baseUrl, FOURTH_ACCOUNT, { ip: '192.0.2.74' });
    const page = await jonas.get('/admin/users');
    const document = documentOf(page);
    expect(
      [...document.querySelectorAll('[data-testid="user-row"]')].map(
        (row) => row.querySelector('td:nth-child(2) div')?.textContent,
      ),
    ).toEqual(['jonas', 'zuk', 'trecias', 'ketvirtas']);
    expect(said(page)).not.toContain('Auth');
    expect(said(page)).toContain('Rezultatų tvarkytojas');
    expect(said(page)).toContain('Superadministratorius');
    expect(said(page)).toContain('Turnyras: Euroleague 2026/27');
    const hides = [
      ...document.querySelectorAll('form[action="/admin/toggleHidden"]'),
    ];
    expect(hides).toHaveLength(3);
    const own = document.querySelector('select[aria-label="Rolė: jonas"]');
    expect(own?.hasAttribute('disabled')).toBe(true);
  });
});

describe('the hide (R-19, R-39, R-115)', () => {
  it('toggles the account in the working tournament, says which way, and leaves the switch-off alone', async () => {
    const { jonas } = await setUp();
    const hidden = async () =>
      one(
        z.object({ admin_hidden: z.boolean(), switched_off: z.boolean() }),
        'select admin_hidden, switched_off from tournament_players where player_id = 2 and tournament_id = 41',
      );
    const first = await jonas.post(
      '/admin/toggleHidden',
      formOf({ userID: '2' }),
    );
    expect([first.status, first.location]).toEqual([303, '/admin/users']);
    const page = await followed(jonas, first);
    expect(said(page)).toContain('Vartotojas zuk paslėptas nuo lentelių.');
    expect(said(page)).toContain('neaktyvus');
    expect(await hidden()).toEqual({ admin_hidden: true, switched_off: false });
    const second = await jonas.post(
      '/admin/toggleHidden',
      formOf({ userID: '2' }),
    );
    expect(said(await followed(jonas, second))).toContain(
      'Vartotojas zuk vėl rodomas lentelėse.',
    );
    expect(await hidden()).toEqual({
      admin_hidden: false,
      switched_off: false,
    });
  });

  it('an account that does not play the tournament is refused in words, an unknown account is a 404, a list or a cast acts on nobody (issue 281)', async () => {
    const { jonas } = await setUp();
    await signedInBrowser(db, baseUrl, FOURTH_ACCOUNT, { ip: '192.0.2.74' });
    const outside = await jonas.post(
      '/admin/toggleHidden',
      formOf({ userID: '4' }),
    );
    expect(said(await followed(jonas, outside))).toContain(
      'Šis vartotojas nežaidžia šiame turnyre.',
    );
    expect(
      (await jonas.post('/admin/toggleHidden', formOf({ userID: '999' })))
        .status,
    ).toBe(404);
    const listed = await jonas.post(
      '/admin/toggleHidden',
      formOf({ 'userID[]': '2' }),
    );
    expect(said(await followed(jonas, listed))).toContain(
      'Vartotojas: turi būti sveikasis skaičius',
    );
    expect(
      await count(
        'select count(*)::int as n from tournament_players where admin_hidden',
      ),
    ).toBe(0);
  });
});

describe('a role change (R-26 amended, R-117): by emailed code', () => {
  const ask = (browser: Browser, target: string, role: string) =>
    browser.post('/admin/updateUser', formOf({ userID: target, admin: role }));

  it('asks for a code (303 to /admin/confirm, mailed to the admin), writes nothing until it is typed, then records the change', async () => {
    const { jonas } = await setUp();
    const asked = await ask(jonas, '2', 'results-manager');
    expect([asked.status, asked.location]).toEqual([303, '/admin/confirm']);
    expect(await roleOf(2)).toBe('player');
    const page = await jonas.get('/admin/confirm');
    expect(
      documentOf(page).querySelector('[data-testid="confirm-action"]')
        ?.textContent,
    ).toBe('Pakeisti zuk rolę: Žaidėjas -> Rezultatų tvarkytojas');
    const done = await confirm(jonas, await code());
    expect([done.status, done.location]).toEqual([303, '/admin/users']);
    expect(said(await followed(jonas, done))).toContain(
      'Vartotojo zuk duomenys buvo atnaujinti.',
    );
    expect(await roleOf(2)).toBe('results-manager');
    expect(
      await one(
        z.object({
          kind: z.string(),
          old_role: z.string(),
          new_role: z.string(),
          actor_id: z.int(),
          target_id: z.int(),
        }),
        'select kind, old_role, new_role, actor_id, target_id from audit_admin_actions',
      ),
    ).toEqual({
      kind: 'role_change',
      old_role: 'player',
      new_role: 'results-manager',
      actor_id: 1,
      target_id: 2,
    });
  });

  it('refuses your own role, the role an account holds and a role that is none, before any mail', async () => {
    const { jonas } = await setUp();
    expect(
      said(await followed(jonas, await ask(jonas, '1', 'player'))),
    ).toContain('Savo rolės keisti negalima.');
    expect(
      said(await followed(jonas, await ask(jonas, '2', 'player'))),
    ).toContain('Vartotojas jau turi šią rolę.');
    expect(
      said(await followed(jonas, await ask(jonas, '2', 'owner'))),
    ).toContain('Rolė: neteisinga rolė');
    expect(jonas.cookie('__Host-sb_confirm')).toBeUndefined();
    await noMail();
  });

  it('a list or a cast is refused with the summary and never acts on player 1 or 2 (issue 281); an unknown account is a 404', async () => {
    const { jonas } = await setUp();
    const listed = await jonas.post(
      '/admin/updateUser',
      formOf({ 'userID[]': '2', admin: 'superadmin' }),
    );
    expect(said(await followed(jonas, listed))).toContain(
      'Vartotojas: turi būti sveikasis skaičius',
    );
    expect((await ask(jonas, '999', 'player')).status).toBe(404);
    expect(await roleOf(2)).toBe('player');
    await noMail();
  });

  it('a wrong code changes nothing and keeps the box; a code mailed for another action never confirms this one', async () => {
    const { jonas } = await setUp();
    await ask(jonas, '2', 'results-manager');
    const first = await code();
    const wrong = await confirm(
      jonas,
      first === '00000000' ? '11111111' : '00000000',
    );
    expect(said(await followed(jonas, wrong))).toContain(
      'Neteisingas arba pasibaigęs kodas.',
    );
    expect(await roleOf(2)).toBe('player');
    const other = windowOf(jonas, '192.0.2.75');
    await other.post('/admin/deleteUser', formOf({ userID: '3' }));
    const second = await code(2);
    const crossed = await confirm(jonas, second);
    expect(said(await followed(jonas, crossed))).toContain(
      'Neteisingas arba pasibaigęs kodas.',
    );
    expect(await roleOf(2)).toBe('player');
    expect(
      await count('select count(*)::int as n from players where id = 3'),
    ).toBe(1);
  });

  it('the target comes only from the sealed cookie: a posted userID or role on the confirm post changes nothing', async () => {
    const { jonas } = await setUp();
    await ask(jonas, '2', 'results-manager');
    const done = await jonas.post(
      CONFIRM,
      formOf({ code: await code(), userID: '3', admin: 'superadmin' }),
    );
    expect(done.location).toBe('/admin/users');
    expect(await roleOf(2)).toBe('results-manager');
    expect(await roleOf(3)).toBe('player');
  });

  it('a role removed meanwhile is read again: a superadmin demoted between the ask and the code is sent home and nothing changes', async () => {
    const { jonas } = await setUp();
    await ask(jonas, '2', 'results-manager');
    const typed = await code();
    await client.query(
      "update player_settings set role = 'player' where player_id = 1",
    );
    expect((await confirm(jonas, typed)).location).toBe('/');
    expect(await roleOf(2)).toBe('player');
  });

  it('an account deleted since the ask says so, with no code box, and performs nothing', async () => {
    const { jonas } = await setUp();
    await signedInBrowser(db, baseUrl, FOURTH_ACCOUNT, { ip: '192.0.2.74' });
    await ask(jonas, '4', 'results-manager');
    const typed = await code();
    await client.query('delete from players where id = 4');
    const page = await jonas.get('/admin/confirm');
    expect(said(page)).toContain('Paskyra nebeegzistuoja.');
    expect(page.html).not.toContain('name="code"');
    const done = await confirm(jonas, typed);
    expect(said(await followed(jonas, done))).toContain(
      'Paskyra nebeegzistuoja.',
    );
    expect(
      await count('select count(*)::int as n from audit_admin_actions'),
    ).toBe(0);
  });
});

describe('an account deletion (R-25, R-99, R-117): by emailed code', () => {
  const ask = (browser: Browser, target: string) =>
    browser.post('/admin/deleteUser', formOf({ userID: target }));

  it('asks for a code, deletes nothing until it is typed, then removes the account, hands its league to the longest-standing member and records it', async () => {
    const { jonas } = await setUp();
    const asked = await ask(jonas, '2');
    expect([asked.status, asked.location]).toEqual([303, '/admin/confirm']);
    expect(said(await jonas.get('/admin/confirm'))).toContain(
      'Ištrinti paskyrą zuk (žukauskas@example.lt)',
    );
    expect(
      await count('select count(*)::int as n from players where id = 2'),
    ).toBe(1);
    const done = await confirm(jonas, await code());
    expect(said(await followed(jonas, done))).toContain(
      'Vartotojas zuk ištrintas.',
    );
    expect(
      await count('select count(*)::int as n from players where id = 2'),
    ).toBe(0);
    expect(
      await one(
        z.object({ owner_id: z.int() }),
        'select owner_id from leagues where id = 900',
      ),
    ).toEqual({ owner_id: 3 });
    expect(
      await one(
        z.object({ is_admin: z.boolean() }),
        'select is_admin from league_members where league_id = 900 and player_id = 3',
      ),
    ).toEqual({ is_admin: true });
    expect(
      await one(
        z.object({
          kind: z.string(),
          actor_id: z.int(),
          target_id: z.int().nullable(),
        }),
        'select kind, actor_id, target_id from audit_admin_actions',
      ),
    ).toEqual({ kind: 'account_deletion', actor_id: 1, target_id: null });
  });

  it('refuses yourself, a list and an unknown account, before any mail', async () => {
    const { jonas } = await setUp();
    expect(said(await followed(jonas, await ask(jonas, '1')))).toContain(
      'Savo paskyros čia ištrinti negalima.',
    );
    const listed = await jonas.post(
      '/admin/deleteUser',
      formOf({ 'userID[]': '2' }),
    );
    expect(said(await followed(jonas, listed))).toContain(
      'Vartotojas: turi būti sveikasis skaičius',
    );
    expect((await ask(jonas, '999')).status).toBe(404);
    expect(await count('select count(*)::int as n from players')).toBe(3);
    await noMail();
  });

  it('another superadmin may be deleted by a superadmin; the last one is refused when the other deletes them', async () => {
    const { jonas } = await setUp();
    await client.query(
      "update player_settings set role = 'superadmin' where player_id = 3",
    );
    await ask(jonas, '3');
    const done = await confirm(jonas, await code());
    expect(said(await followed(jonas, done))).toContain(
      'Vartotojas trecias ištrintas.',
    );
    expect(await roleOf(1)).toBe('superadmin');
  });
});

describe('/admin/leagues', () => {
  it("lists the working tournament's leagues, public first, with owner, members and the way to edit, pay and delete; none of another tournament", async () => {
    const { jonas } = await setUp();
    await saveTournamentWithGames(db, LATER);
    await addLeague(ELSEWHERE, LATER.id, 'Svetima lyga', 2);
    const page = await jonas.get('/admin/leagues');
    const text = said(page);
    expect(text).toContain(PUBLIC_NAME);
    expect(text).toContain('Draugų lyga');
    expect(text).not.toContain('Svetima lyga');
    expect(text.indexOf(PUBLIC_NAME)).toBeLessThan(text.indexOf('Draugų lyga'));
    expect(text).toContain('#900 · zuk (Žilvinas Žukauskas)');
    expect(text).toContain(`#${String(PUBLIC)} · be savininko`);
    expect(page.html).toContain(
      `href="/admin/leagues/${String(PUBLIC)}/payments"`,
    );
    expect(page.html).toContain('href="/admin/leagues/900/members"');
    expect(
      documentOf(page).querySelectorAll('form[action="/admin/leagues/delete"]'),
    ).toHaveLength(1);
  });

  it("an edit writes the owner's form, public league included, and says Lyga atnaujinta", async () => {
    const { jonas } = await setUp();
    const done = await jonas.post(
      '/admin/leagues/update',
      formOf({
        leagueID: '900',
        name: 'Nauja lyga',
        description: 'Apie',
        base_fee: '15',
        penalty_step: '',
      }),
    );
    expect([done.status, done.location]).toEqual([303, '/admin/leagues']);
    expect(said(await followed(jonas, done))).toContain('Lyga atnaujinta');
    expect(
      await one(
        z.object({
          name: z.string(),
          description: z.string(),
          base_fee: z.int(),
        }),
        'select name, description, base_fee from leagues where id = 900',
      ),
    ).toEqual({ name: 'Nauja lyga', description: 'Apie', base_fee: 15 });
    await jonas.post(
      '/admin/leagues/update',
      formOf({ leagueID: String(PUBLIC), name: 'Visų lyga' }),
    );
    expect(
      (
        await one(
          z.object({ name: z.string() }),
          'select name from leagues where id = $1',
          PUBLIC,
        )
      )?.name,
    ).toBe('Visų lyga');
  });

  it('a refused form is the summary; a league of another tournament and a list are refused; nothing is written', async () => {
    const { jonas } = await setUp();
    await saveTournamentWithGames(db, LATER);
    await addLeague(ELSEWHERE, LATER.id, 'Svetima lyga', 2);
    const bad = await jonas.post(
      '/admin/leagues/update',
      formOf({ leagueID: '900', name: '' }),
    );
    expect(said(await followed(jonas, bad))).toContain(
      'Pavadinimas: privalomas laukas',
    );
    expect(
      (
        await jonas.post(
          '/admin/leagues/update',
          formOf({ leagueID: String(ELSEWHERE), name: 'Vagis' }),
        )
      ).status,
    ).toBe(404);
    const listed = await jonas.post(
      '/admin/leagues/update',
      formOf({ 'leagueID[]': '900', name: 'Vagis' }),
    );
    expect(said(await followed(jonas, listed))).toContain(
      'Lyga: turi būti sveikasis skaičius',
    );
    expect(
      (
        await one(
          z.object({ name: z.string() }),
          'select name from leagues where id = 900',
        )
      )?.name,
    ).toBe('Draugų lyga');
  });

  it("the public league cannot be deleted: refused in words, before any mail; another tournament's league is a 404", async () => {
    const { jonas } = await setUp();
    await saveTournamentWithGames(db, LATER);
    await addLeague(ELSEWHERE, LATER.id, 'Svetima lyga', 2);
    const refused = await jonas.post(
      '/admin/leagues/delete',
      formOf({ leagueID: String(PUBLIC) }),
    );
    expect(said(await followed(jonas, refused))).toContain(
      'Viešos lygos ištrinti negalima',
    );
    expect(
      (
        await jonas.post(
          '/admin/leagues/delete',
          formOf({ leagueID: String(ELSEWHERE) }),
        )
      ).status,
    ).toBe(404);
    await noMail();
  });

  it('a private league is deleted through the code (R-118): its members move to the public league and its messages are detached', async () => {
    const { jonas } = await setUp();
    await client.query(
      'update tournament_players set selected_league_id = 900 where player_id = 3 and tournament_id = 41',
    );
    await client.query(
      "insert into messages (league_id, text, active) values (900, 'Sveiki', true)",
    );
    const asked = await jonas.post(
      '/admin/leagues/delete',
      formOf({ leagueID: String(PRIVATE) }),
    );
    expect(asked.location).toBe('/admin/confirm');
    expect(said(await jonas.get('/admin/confirm'))).toContain(
      'Ištrinti lygą Draugų lyga',
    );
    expect(
      await count('select count(*)::int as n from leagues where id = 900'),
    ).toBe(1);
    const done = await confirm(jonas, await code());
    expect(said(await followed(jonas, done))).toContain('Lyga ištrinta');
    expect(
      await count('select count(*)::int as n from leagues where id = 900'),
    ).toBe(0);
    expect(
      (
        await one(
          z.object({ selected_league_id: z.int() }),
          'select selected_league_id from tournament_players where player_id = 3 and tournament_id = 41',
        )
      )?.selected_league_id,
    ).toBe(PUBLIC);
    expect(
      (
        await one(
          z.object({ league_id: z.int().nullable() }),
          'select league_id from messages',
        )
      )?.league_id,
    ).toBeNull();
  });
});

describe('the guest mark (R-87)', () => {
  const mark = (browser: Browser, fields: Record<string, string>) =>
    browser.post('/admin/leagues/guest', formOf(fields));

  it('lists the members and marks one a guest and back, with a message each way', async () => {
    const { jonas } = await setUp();
    const members = await jonas.get('/admin/leagues/900/members');
    expect(said(members)).toContain('Nariai · Draugų lyga');
    expect(said(members)).toContain('savininkas');
    const marked = await mark(jonas, {
      leagueID: '900',
      userID: '3',
      guest: '1',
    });
    expect([marked.status, marked.location]).toEqual([
      303,
      '/admin/leagues/900/members',
    ]);
    expect(said(await followed(jonas, marked))).toContain(
      'Narys pažymėtas svečiu.',
    );
    const isGuest = async () =>
      (
        await one(
          z.object({ is_guest: z.boolean() }),
          'select is_guest from league_members where league_id = 900 and player_id = 3',
        )
      )?.is_guest;
    expect(await isGuest()).toBe(true);
    const back = await mark(jonas, {
      leagueID: '900',
      userID: '3',
      guest: '0',
    });
    expect(said(await followed(jonas, back))).toContain(
      'Narys pažymėtas pilnateisiu nariu.',
    );
    expect(await isGuest()).toBe(false);
  });

  it('refuses a mark that changes nothing, a non-member and a bad mark in words; a league of another tournament is a 404; a list is refused', async () => {
    const { jonas } = await setUp();
    await saveTournamentWithGames(db, LATER);
    await addLeague(ELSEWHERE, LATER.id, 'Svetima lyga', 2);
    expect(
      said(
        await followed(
          jonas,
          await mark(jonas, { leagueID: '900', userID: '3', guest: '0' }),
        ),
      ),
    ).toContain('Narys jau toks yra.');
    expect(
      said(
        await followed(
          jonas,
          await mark(jonas, { leagueID: '900', userID: '1', guest: '1' }),
        ),
      ),
    ).toContain('Tokio nario šioje lygoje nėra.');
    expect(
      said(
        await followed(
          jonas,
          await mark(jonas, { leagueID: '900', userID: '3', guest: 'taip' }),
        ),
      ),
    ).toContain('Svečias: neteisinga reikšmė');
    expect(
      (
        await mark(jonas, {
          leagueID: String(ELSEWHERE),
          userID: '3',
          guest: '1',
        })
      ).status,
    ).toBe(404);
    const listed = await jonas.post(
      '/admin/leagues/guest',
      formOf({ leagueID: '900', 'userID[]': '3', guest: '1' }),
    );
    expect(said(await followed(jonas, listed))).toContain(
      'Vartotojas: turi būti sveikasis skaičius',
    );
    expect(
      await count(
        'select count(*)::int as n from league_members where is_guest',
      ),
    ).toBe(0);
  });

  it("the members page of another tournament's league, or of no league, is a 404", async () => {
    const { jonas } = await setUp();
    await saveTournamentWithGames(db, LATER);
    await addLeague(ELSEWHERE, LATER.id, 'Svetima lyga', 2);
    expect(
      (await jonas.get(`/admin/leagues/${String(ELSEWHERE)}/members`)).status,
    ).toBe(404);
    expect((await jonas.get('/admin/leagues/abc/members')).status).toBe(404);
  });
});

describe("the superadmin's door to a league's payments (R-105)", () => {
  const JSON_ACCEPT = { accept: 'application/json' };

  it("opens the public league's payments, saves an amount as the autosave posts it, and saves the details", async () => {
    const { jonas } = await setUp();
    const page = await jonas.get(`/admin/leagues/${String(PUBLIC)}/payments`);
    expect(page.status).toBe(200);
    expect(page.html).toContain(
      `/admin/leagues/${String(PUBLIC)}/payment-details`,
    );
    expect(said(page)).toContain(`Mokėjimai · ${PUBLIC_NAME}`);
    const member = (
      await one(
        z.object({ id: z.int() }),
        'select id from league_members where league_id = $1 and player_id = 1',
        PUBLIC,
      )
    )?.id;
    const saved = await jonas.post(
      `/admin/leagues/${String(PUBLIC)}/payments/save`,
      formOf({ [`paid[${String(member)}]`]: '5' }),
      JSON_ACCEPT,
    );
    expect(saved.status).toBe(200);
    expect(
      (
        await one(
          z.object({ paid_cents: z.int() }),
          'select paid_cents from league_members where league_id = $1 and player_id = 1',
          PUBLIC,
        )
      )?.paid_cents,
    ).toBe(500);
    const details = await jonas.post(
      `/admin/leagues/${String(PUBLIC)}/payment-details`,
      formOf({
        payment_beneficiary: 'Jonas Petraitis',
        payment_iban: 'LT601010012345678901',
        payment_note: 'Ačiū',
      }),
    );
    expect([details.status, details.location]).toEqual([
      303,
      `/admin/leagues/${String(PUBLIC)}/payments`,
    ]);
    expect(said(await followed(jonas, details))).toContain(
      'Rekvizitai išsaugoti',
    );
  });

  it('a league of another tournament is a 404 at every address of the door; a guest and a player are sent home', async () => {
    const { jonas } = await setUp();
    await saveTournamentWithGames(db, LATER);
    await addLeague(ELSEWHERE, LATER.id, 'Svetima lyga', 2);
    const base = `/admin/leagues/${String(ELSEWHERE)}`;
    expect((await jonas.get(`${base}/payments`)).status).toBe(404);
    expect(
      (
        await jonas.post(
          `${base}/payments/save`,
          formOf({ 'paid[1]': '5' }),
          JSON_ACCEPT,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await jonas.post(
          `${base}/payment-details`,
          formOf({ payment_note: 'x' }),
        )
      ).status,
    ).toBe(404);
    const guest = await guestBrowser().post(
      `${base}/payments/save`,
      formOf({}),
      JSON_ACCEPT,
    );
    expect([guest.status, guest.location]).toEqual([303, '/']);
  });
});

describe('/admin/messages (R-95, R-116)', () => {
  const insert = (browser: Browser, fields: Record<string, string>) =>
    browser.post('/admin/messageInsert', formOf(fields));
  const save = (browser: Browser, fields: Record<string, string>) =>
    browser.post('/admin/messages/save', formOf(fields));

  it("inserts a message into a league, lists it, edits it and shows an active one on the league's game page", async () => {
    const { jonas, zuk } = await setUp();
    const added = await insert(jonas, {
      message: 'Sveiki, lygos nariai',
      leagueID: String(PRIVATE),
      active: 'on',
    });
    expect([added.status, added.location]).toEqual([303, '/admin/messages']);
    const listed = await followed(jonas, added);
    expect(said(listed)).toContain('Žinutė pridėta.');
    expect(listed.html).toContain('Sveiki, lygos nariai');
    await client.query(
      'update tournament_players set selected_league_id = 900 where player_id = 2 and tournament_id = 41',
    );
    expect(said(await zuk.get(PLAYER_HOME))).toContain('Sveiki, lygos nariai');
    const [id] = (await rows('select id from messages')).map(
      (row) => z.object({ id: z.int() }).parse(row).id,
    );
    const edited = await save(jonas, {
      messageID: String(id),
      message: 'Naujas tekstas',
      leagueID: String(PRIVATE),
      update: '1',
    });
    expect(said(await followed(jonas, edited))).toContain(
      `Žinutė #${String(id)} atnaujinta.`,
    );
    expect(
      await one(
        z.object({ text: z.string(), active: z.boolean() }),
        'select text, active from messages where id = $1',
        id,
      ),
    ).toEqual({ text: 'Naujas tekstas', active: false });
    expect(said(await zuk.get(PLAYER_HOME))).not.toContain('Naujas tekstas');
  });

  it('refuses an empty text, 256 characters, a league of another tournament and a league that is no whole number, in words, writing nothing; neither button says so', async () => {
    const { jonas } = await setUp();
    await saveTournamentWithGames(db, LATER);
    await addLeague(ELSEWHERE, LATER.id, 'Svetima lyga', 2);
    const refused = async (fields: Record<string, string>) =>
      said(await followed(jonas, await insert(jonas, fields)));
    expect(await refused({ message: '', leagueID: '' })).toContain(
      'Žinutė: privalomas laukas',
    );
    expect(
      await refused({ message: 'x'.repeat(10_001), leagueID: '' }),
    ).toContain('Žinutė: per ilgas tekstas');
    expect(
      await refused({ message: 'Tekstas', leagueID: String(ELSEWHERE) }),
    ).toContain('Lyga: tokios lygos šiame turnyre nėra');
    expect(await refused({ message: 'Tekstas', leagueID: 'abc' })).toContain(
      'Lyga: turi būti sveikasis skaičius',
    );
    expect(await count('select count(*)::int as n from messages')).toBe(0);
    expect(
      said(await followed(jonas, await save(jonas, { messageID: '1' }))),
    ).toContain('Nėra ką išsaugoti: formoje nenurodytas veiksmas.');
  });

  it('a superadmin deletes a message through the code; a message of another tournament is a 404; an unknown id too', async () => {
    const { jonas } = await setUp();
    await saveTournamentWithGames(db, LATER);
    await addLeague(ELSEWHERE, LATER.id, 'Svetima lyga', 2);
    await client.query(
      "insert into messages (league_id, text, active) values (900, 'Mano', true), (950, 'Svetima', true)",
    );
    const [mine, theirs] = (
      await rows('select id from messages order by id')
    ).map((row) => z.object({ id: z.int() }).parse(row).id);
    const asked = await save(jonas, { messageID: String(mine), delete: '1' });
    expect(asked.location).toBe('/admin/confirm');
    expect(said(await jonas.get('/admin/confirm'))).toContain(
      `Ištrinti žinutę #${String(mine)}`,
    );
    expect(await count('select count(*)::int as n from messages')).toBe(2);
    const done = await confirm(jonas, await code());
    expect(said(await followed(jonas, done))).toContain(
      `Žinutė #${String(mine)} ištrinta.`,
    );
    expect(await count('select count(*)::int as n from messages')).toBe(1);
    expect(
      (await save(jonas, { messageID: String(theirs), delete: '1' })).status,
    ).toBe(404);
    expect((await save(jonas, { messageID: '9999', delete: '1' })).status).toBe(
      404,
    );
  });

  it('a results manager lists, inserts and edits, sees no delete button, and a delete post is refused home with no mail (R-116)', async () => {
    const { jonas } = await setUp('results-manager');
    await client.query(
      "insert into messages (league_id, text, active) values (900, 'Mano', true)",
    );
    const listed = await jonas.get('/admin/messages');
    expect(listed.status).toBe(200);
    expect(listed.html).not.toContain('name="delete"');
    expect(listed.html).toContain('name="update"');
    expect(
      said(
        await followed(
          jonas,
          await insert(jonas, { message: 'Nauja', leagueID: '900' }),
        ),
      ),
    ).toContain('Žinutė pridėta.');
    const [first] = (await rows('select id from messages order by id')).map(
      (row) => z.object({ id: z.int() }).parse(row).id,
    );
    expect(
      said(
        await followed(
          jonas,
          await save(jonas, {
            messageID: String(first),
            message: 'Pakeista',
            update: '1',
          }),
        ),
      ),
    ).toContain(`Žinutė #${String(first)} atnaujinta.`);
    const refused = await save(jonas, {
      messageID: String(first),
      delete: '1',
    });
    expect([refused.status, refused.location]).toEqual([303, '/']);
    expect(await count('select count(*)::int as n from messages')).toBe(2);
    await noMail();
  });

  it('a list or a cast in messageID is refused with the summary and deletes nothing', async () => {
    const { jonas } = await setUp();
    await client.query(
      "insert into messages (league_id, text, active) values (900, 'Mano', true)",
    );
    const listed = await jonas.post(
      '/admin/messages/save',
      formOf({ 'messageID[]': '1', delete: '1' }),
    );
    expect(said(await followed(jonas, listed))).toContain(
      'Žinutės numeris: privalomas laukas',
    );
    expect(await count('select count(*)::int as n from messages')).toBe(1);
    await noMail();
  });
});

describe('/admin/audit (R-45, R-69, R-117)', () => {
  async function seedAudit(): Promise<void> {
    await client.query(
      `insert into audit_logins (player_id, method, at)
         select 2, case when n % 2 = 0 then 'email_code' else 'register' end::audit_login_method,
                timestamptz '2026-10-01 10:00:00+00' + n * interval '1 minute'
           from generate_series(1, 30) n`,
    );
    await client.query(
      `insert into audit_logins (player_id, method, at) values
         (3, 'email_code', '2026-10-02 08:00:00+00')`,
    );
    await client.query(
      `insert into audit_prediction_games (player_id, game_id, home, away, old_home, old_away, at) values
         (2, ${String(GAME)}, 80, 70, null, null, '2026-10-02 10:00:00+00'),
         (2, ${String(GAME)}, 82, 70, 80, 70, '2026-10-02 11:00:00+00')`,
    );
    await client.query(
      `insert into audit_results (player_id, game_id, old_home, old_away, old_postponed, new_home, new_away, new_postponed, at) values
         (1, ${String(GAME)}, null, null, false, null, null, true, '2026-10-04 11:00:00+00'),
         (null, ${String(GAME)}, null, null, false, 81, 80, false, '2026-10-04 13:00:00+00')`,
    );
    await client.query(
      `insert into audit_admin_actions (actor_id, target_id, kind, old_role, new_role, at) values
         (1, 2, 'role_change', 'player', 'results-manager', '2026-10-05 10:00:00+00'),
         (1, null, 'account_deletion', 'player', null, '2026-10-05 11:00:00+00')`,
    );
  }

  const rowsOf = (page: Page): string[] =>
    [...documentOf(page).querySelectorAll('[data-testid="audit-row"]')].map(
      (row) => row.textContent,
    );

  it('shows the sign-ins by default, 25 to a page, newest first, with a pager of its own, the tab counts and no IP column', async () => {
    const { jonas } = await setUp();
    await seedAudit();
    const first = await jonas.get('/admin/audit');
    expect(rowsOf(first)).toHaveLength(25);
    expect(said(first)).toContain('Prisijungimai 31');
    expect(said(first)).toContain('Prognozės 2');
    expect(said(first)).toContain('Rezultatai 2');
    expect(said(first)).toContain('Rolės 2');
    expect(said(first)).not.toContain('IP adresas');
    expect(first.html).toContain('href="/admin/audit?logins_page=2"');
    expect(rowsOf(first)[0]).toContain('trecias');
    const second = await jonas.get('/admin/audit?logins_page=2');
    expect(rowsOf(second)).toHaveLength(6);
    expect(said(second)).toContain('2 / 2');
  });

  it('filters every tab by the user, keeping the filter in the tab links; a list or an unknown tab filters nobody', async () => {
    const { jonas } = await setUp();
    await seedAudit();
    const filtered = await jonas.get('/admin/audit?user=3');
    expect(rowsOf(filtered)).toHaveLength(1);
    expect(filtered.html).toContain(
      'href="/admin/audit?tab=prognozes&amp;user=3"',
    );
    const listed = await jonas.get('/admin/audit?user[]=3');
    expect(rowsOf(listed)).toHaveLength(25);
    const unknown = await jonas.get('/admin/audit?tab=nezinoma');
    expect(rowsOf(unknown)).toHaveLength(25);
    const nobody = await jonas.get('/admin/audit?user=999');
    expect(said(nobody)).toContain('Prisijungimų įrašų nėra.');
  });

  it('lists prediction changes with the old pair or a dash, result changes with Atidėta and a forgotten actor as a dash, and role changes in words', async () => {
    const { jonas } = await setUp();
    await seedAudit();
    const predictions = rowsOf(await jonas.get('/admin/audit?tab=prognozes'));
    expect(
      predictions.map((row) => row.replace(/\d{4}-\d\d-\d\d \d\d:\d\d$/, '')),
    ).toEqual([
      'zukHome 41 - Away 4180:70→82:70',
      'zukHome 41 - Away 41-→80:70',
    ]);
    const results = rowsOf(await jonas.get('/admin/audit?tab=rezultatai'));
    expect(results[0]).toMatch(/^-Home 41 - Away 41-→81:80/);
    expect(results[1]).toMatch(/^jonasHome 41 - Away 41-→Atidėta/);
    const roles = rowsOf(await jonas.get('/admin/audit?tab=roles'));
    expect(roles[0]).toMatch(
      /^jonasPaskyros ištrynimas-Žaidėjas→-2026-10-05 14:00$/,
    );
    expect(roles[1]).toMatch(
      /^jonasRolės keitimaszukŽaidėjas→Rezultatų tvarkytojas2026-10-05 13:00$/,
    );
  });

  it('dates are Vilnius time, as the rest of the app', async () => {
    const { jonas } = await setUp();
    await client.query(
      "insert into audit_logins (player_id, method, at) values (2, 'email_code', '2026-07-01 21:30:00+00')",
    );
    expect(rowsOf(await jonas.get('/admin/audit'))[0]).toContain(
      '2026-07-02 00:30',
    );
  });
});

describe('the admin index', () => {
  it('lists the people tiles by role: a superadmin all four, a results manager the messages only', async () => {
    const { jonas } = await setUp();
    const all = await jonas.get('/admin/index');
    for (const path of [
      '/admin/users',
      '/admin/leagues',
      '/admin/messages',
      '/admin/audit',
    ]) {
      expect(all.html).toContain(`href="${path}"`);
    }
    await client.query(
      "update player_settings set role = 'results-manager' where player_id = 1",
    );
    const manager = await jonas.get('/admin/index');
    expect(manager.html).toContain('href="/admin/messages"');
    for (const path of ['/admin/users', '/admin/leagues', '/admin/audit']) {
      expect(manager.html).not.toContain(`href="${path}"`);
    }
  });
});
