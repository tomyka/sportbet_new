import { insertTournamentPlayer, useTestDatabase } from '@sportbet/db/testing';
import { emailAddress, type StoredPlayer } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { LEAGUES_PATH } from '../../src/components/shell/shell-paths';
import {
  JONAS_ACCOUNT,
  saveAccounts,
  ZUKAUSKAS_ACCOUNT,
} from '../support/accounts';
import { Browser, documentOf, type Page } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { savePlaying } from '../support/predictions';
import { CLOSED } from '../support/registration';

// /leagues (slice 12b, #29): LeagueController's create, update, invite,
// search, accept, decline, leave and delete, and R-23's hand-over, against
// the built app. In CLOSED (43) Jonas (1), Žukauskas (2) and Trečias (3)
// play; Šarūnas (4) has an account and plays nothing. League 900 belongs to
// Jonas (admin, owner) with Trečias as a member.

const TRECIAS_ACCOUNT: StoredPlayer = {
  id: player('3'),
  username: 'trecias',
  email: unwrap(emailAddress('trecias@example.lt')),
  name: 'Trečias',
  surname: 'Trečiauskas',
};

const SARUNAS_ACCOUNT: StoredPlayer = {
  id: player('4'),
  username: 'sarunas',
  email: unwrap(emailAddress('sarunas.jasikevicius@example.lt')),
  name: 'Šarūnas',
  surname: 'Jasikevičius',
};

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PRIVATE = 900;
const OTHERS = 901;
const FROM_LEAGUES = { referer: `${baseUrl}${LEAGUES_PATH}` };

const form = (fields: Record<string, string>): FormData => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return body;
};

/** Jonas and Žukauskas signed in, Trečias and Šarūnas saved, league 900 set up. */
async function setUp(): Promise<{
  readonly jonas: Browser;
  readonly zuk: Browser;
}> {
  const jonas = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
  await savePlaying(db, client, CLOSED);
  const zuk = await signedInBrowser(db, baseUrl, ZUKAUSKAS_ACCOUNT, {
    ip: '192.0.2.41',
  });
  await saveAccounts(db, [TRECIAS_ACCOUNT, SARUNAS_ACCOUNT]);
  for (const id of [2, 3]) {
    await insertTournamentPlayer(client, { tournament: CLOSED.id, player: id });
  }
  await client.query(
    'insert into leagues (id, tournament_id, name, is_public, owner_id) overriding system value values ($1, $2, $3, false, 1)',
    [PRIVATE, CLOSED.id, 'Draugų lyga'],
  );
  await addMember(PRIVATE, 1, true);
  await addMember(PRIVATE, 3, false);
  return { jonas, zuk };
}

async function addMember(
  league: number,
  id: number,
  isAdmin: boolean,
): Promise<void> {
  await client.query(
    'insert into league_members (league_id, player_id, is_admin) values ($1, $2, $3)',
    [league, id, isAdmin],
  );
}

/** League 901: Žukauskas's, with Jonas in it. */
async function othersLeague(): Promise<void> {
  await client.query(
    'insert into leagues (id, tournament_id, name, is_public, owner_id) overriding system value values ($1, $2, $3, false, 2)',
    [OTHERS, CLOSED.id, 'Svetimų lyga'],
  );
  await addMember(OTHERS, 2, true);
  await addMember(OTHERS, 1, false);
}

const countOf = async (sql: string, args: unknown[] = []): Promise<number> => {
  const { rows } = await client.query(sql, args);
  return z.array(z.object({ n: z.coerce.number() })).parse(rows)[0]?.n ?? -1;
};

const memberCount = (league: number, id: number) =>
  countOf(
    'select count(*) as n from league_members where league_id = $1 and player_id = $2',
    [league, id],
  );

const inviteCount = (league: number) =>
  countOf('select count(*) as n from league_invites where league_id = $1', [
    league,
  ]);

const leagueNamed = (name: string) =>
  countOf('select count(*) as n from leagues where name = $1', [name]);

/** The league a player's tables show in CLOSED. */
async function selected(id: number): Promise<number> {
  const { rows } = await client.query(
    'select selected_league_id from tournament_players where player_id = $1 and tournament_id = $2',
    [id, CLOSED.id],
  );
  const [row] = z.array(z.object({ selected_league_id: z.int() })).parse(rows);
  return row?.selected_league_id ?? 0;
}

/** The one-time message on a page, if any (a status or an alert). */
const messageOn = (page: Page): string | null =>
  documentOf(page).querySelector('[role="status"], [role="alert"]')
    ?.textContent ?? null;

const rowsOf = (page: Page): string[] =>
  [...documentOf(page).querySelectorAll('[data-testid="league-row"]')].map(
    (row) => row.textContent,
  );

/** The usernames in the game page's table, sorted. */
const tableOf = (page: Page): string[] =>
  [...documentOf(page).querySelectorAll('[data-testid="lb-row"]')]
    .flatMap((row) =>
      ['jonas', 'zuk', 'trecias'].filter((name) =>
        row.textContent.includes(name),
      ),
    )
    .sort();

describe('GET /leagues', () => {
  it('a guest is sent to sign in and, after it, back to /leagues', async () => {
    await setUp();
    const answer = await new Browser(baseUrl, '192.0.2.62').get(LEAGUES_PATH);
    expect(answer.status).toBe(307);
    expect(answer.location).toBe(
      `/login?intended=${encodeURIComponent(LEAGUES_PATH)}`,
    );
  });

  it("a player sees their league with its badge, the member count, and the owner's buttons", async () => {
    const { jonas } = await setUp();
    const page = await jonas.get(LEAGUES_PATH);
    expect(page.status).toBe(200);
    const mine = rowsOf(page).find((row) => row.includes('Draugų lyga'));
    expect(mine).toContain('Savininkas');
    expect(mine).toContain('2');
    const titles = [...documentOf(page).querySelectorAll('[title]')].map(
      (element) => element.getAttribute('title'),
    );
    expect(titles).toEqual(
      expect.arrayContaining([
        'Pakviesti narį',
        'Redaguoti lygą',
        'Perduoti valdymą',
      ]),
    );
    expect(titles).not.toContain('Palikti lygą');
  });

  it('a player with no tournament sees no league and the empty text', async () => {
    await setUp();
    const nobody = await signedInBrowser(db, baseUrl, SARUNAS_ACCOUNT, {
      ip: '192.0.2.43',
    });
    const page = await nobody.get(LEAGUES_PATH);
    expect(page.status).toBe(200);
    expect(documentOf(page).body.textContent).toContain(
      'Dar nepriklausote jokiai lygai.',
    );
  });
});

describe('POST /leagues/create (LeagueController::create)', () => {
  it('founds a private league the player owns and administers, not selected; "Lyga sukurta" shows once on /leagues', async () => {
    const { jonas } = await setUp();
    const answer = await jonas.post(
      '/leagues/create',
      form({ name: 'Naujoji', description: 'Aprašas', base_fee: '10' }),
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(LEAGUES_PATH);
    const { rows } = await client.query(
      'select l.owner_id, l.base_fee, l.is_public, m.is_admin, m.is_guest from leagues l join league_members m on m.league_id = l.id and m.player_id = 1 where l.name = $1',
      ['Naujoji'],
    );
    expect(rows).toEqual([
      {
        owner_id: 1,
        base_fee: 10,
        is_public: false,
        is_admin: true,
        is_guest: false,
      },
    ]);
    expect(await selected(1)).not.toBe(PRIVATE);
    const page = await jonas.get(LEAGUES_PATH);
    expect(messageOn(page)).toBe('Lyga sukurta');
    expect(rowsOf(page).join('|')).toContain('Naujoji');
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBeNull();
  });

  it("lists every refused field as Laravel's 422 and creates nothing", async () => {
    const { jonas } = await setUp();
    const answer = await jonas.post(
      '/leagues/create',
      form({ name: '', base_fee: 'abc', penalty_step: '-1' }),
    );
    expect(answer.status).toBe(422);
    expect(JSON.parse(answer.html)).toEqual({
      message: 'The name field is required. (and 2 more errors)',
      errors: {
        name: ['The name field is required.'],
        base_fee: ['The base fee field must be an integer.'],
        penalty_step: ['The penalty step field must be at least 0.'],
      },
    });
    expect(await countOf('select count(*) as n from leagues')).toBe(2);
  });

  it('a player in no tournament is told to choose one (issue 272); nothing is created', async () => {
    await setUp();
    const nobody = await signedInBrowser(db, baseUrl, SARUNAS_ACCOUNT, {
      ip: '192.0.2.43',
    });
    const answer = await nobody.post('/leagues/create', form({ name: 'Nėra' }));
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(LEAGUES_PATH);
    expect(messageOn(await nobody.get(LEAGUES_PATH))).toBe(
      'Nepasirinktas turnyras. Pasirinkite jį ir bandykite dar kartą.',
    );
    expect(await leagueNamed('Nėra')).toBe(0);
  });

  it('a post from another site is a 403 and a guest is sent to sign in; nothing is created', async () => {
    const { jonas } = await setUp();
    const crossSite = await jonas.post(
      '/leagues/create',
      form({ name: 'X1' }),
      {
        origin: 'https://evil.example',
      },
    );
    expect(crossSite.status).toBe(403);
    const guest = await new Browser(baseUrl, '192.0.2.62').post(
      '/leagues/create',
      form({ name: 'X2' }),
    );
    expect(guest.status).toBe(303);
    expect(guest.location).toBe('/login');
    expect(await leagueNamed('X1')).toBe(0);
    expect(await leagueNamed('X2')).toBe(0);
  });
});

describe('POST /leagues/update (LeagueController::update)', () => {
  it('an admin changes name, description and fees; "Lyga atnaujinta" shows', async () => {
    const { jonas } = await setUp();
    const answer = await jonas.post(
      '/leagues/update',
      form({
        leagueID: String(PRIVATE),
        name: 'Pervadinta',
        description: 'Naujas',
        base_fee: '5',
        penalty_step: '1',
      }),
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(LEAGUES_PATH);
    const { rows } = await client.query(
      'select name, description, base_fee, penalty_step from leagues where id = $1',
      [PRIVATE],
    );
    expect(rows).toEqual([
      {
        name: 'Pervadinta',
        description: 'Naujas',
        base_fee: 5,
        penalty_step: 1,
      },
    ]);
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe('Lyga atnaujinta');
  });

  it('a member who is no admin finds no league: 404, nothing changes', async () => {
    await setUp();
    const trecias = await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, {
      ip: '192.0.2.44',
    });
    const answer = await trecias.post(
      '/leagues/update',
      form({ leagueID: String(PRIVATE), name: 'Užgrobta' }),
    );
    expect(answer.status).toBe(404);
    expect(await leagueNamed('Užgrobta')).toBe(0);
  });

  it.each([
    ['', 422],
    ['abc', 422],
    ['0', 404],
    ['99999999999', 404],
  ])('a leagueID of %j is a %i', async (typed, status) => {
    const { jonas } = await setUp();
    const answer = await jonas.post(
      '/leagues/update',
      form({ leagueID: typed, name: 'X' }),
    );
    expect(answer.status).toBe(status);
  });
});

describe("the admin gate comes before validation in update and invite (sportbet's firstOrFail)", () => {
  it('update: a non-admin posting a bad form gets 404, an admin gets 422', async () => {
    const { jonas } = await setUp();
    const trecias = await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, {
      ip: '192.0.2.44',
    });
    const bad = form({ leagueID: String(PRIVATE), name: '', base_fee: 'x' });
    expect((await trecias.post('/leagues/update', bad)).status).toBe(404);
    expect((await jonas.post('/leagues/update', bad)).status).toBe(422);
  });

  it('invite: a non-admin posting a bad invitee gets 404, an admin gets 422', async () => {
    const { jonas } = await setUp();
    const trecias = await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, {
      ip: '192.0.2.44',
    });
    const bad = form({ leagueID: String(PRIVATE), invitedUserID: 'x' });
    expect((await trecias.post('/leagues/invite', bad)).status).toBe(404);
    expect((await jonas.post('/leagues/invite', bad)).status).toBe(422);
  });

  it('search: a bad query is a 422 for a non-admin too (sportbet validates first); a valid one is a 404 for them', async () => {
    const { jonas } = await setUp();
    const trecias = await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, {
      ip: '192.0.2.44',
    });
    const bad = `/leagues/searchUsers?leagueID=${String(PRIVATE)}&query[]=a`;
    const good = `/leagues/searchUsers?leagueID=${String(PRIVATE)}&query=zuk`;
    expect((await trecias.get(bad)).status).toBe(422);
    expect((await jonas.get(bad)).status).toBe(422);
    expect((await trecias.get(good)).status).toBe(404);
  });
});

describe('POST /leagues/invite and GET /leagues/searchUsers', () => {
  it('an admin invites a tournament player, who then sees the invite and the badge', async () => {
    const { jonas, zuk } = await setUp();
    const answer = await jonas.post(
      '/leagues/invite',
      form({ leagueID: String(PRIVATE), invitedUserID: '2' }),
      FROM_LEAGUES,
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(LEAGUES_PATH);
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe(
      'Kvietimas išsiųstas',
    );
    const page = await zuk.get(LEAGUES_PATH);
    expect(documentOf(page).body.textContent).toContain('Draugų lyga');
    expect(documentOf(page).body.textContent).toContain('pakvietė jonas');
    expect(
      documentOf(page).querySelector('[data-testid="invite-count"]')
        ?.textContent,
    ).toBe('1');
    expect(documentOf(page).querySelector('[data-invites]')?.textContent).toBe(
      '1',
    );
  });

  it('refuses a player who has not joined the tournament (R-20), as an error, and writes no invite', async () => {
    const { jonas } = await setUp();
    const answer = await jonas.post(
      '/leagues/invite',
      form({ leagueID: String(PRIVATE), invitedUserID: '4' }),
      FROM_LEAGUES,
    );
    expect(answer.status).toBe(303);
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe(
      'Šis žaidėjas dar neprisijungė prie šio turnyro.',
    );
    expect(await inviteCount(PRIVATE)).toBe(0);
  });

  it('refuses a member and a player already invited', async () => {
    const { jonas } = await setUp();
    await jonas.post(
      '/leagues/invite',
      form({ leagueID: String(PRIVATE), invitedUserID: '3' }),
      FROM_LEAGUES,
    );
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe(
      'Vartotojas jau narys arba pakviestas',
    );
    await jonas.post(
      '/leagues/invite',
      form({ leagueID: String(PRIVATE), invitedUserID: '2' }),
      FROM_LEAGUES,
    );
    await jonas.get(LEAGUES_PATH);
    await jonas.post(
      '/leagues/invite',
      form({ leagueID: String(PRIVATE), invitedUserID: '2' }),
      FROM_LEAGUES,
    );
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe(
      'Vartotojas jau narys arba pakviestas',
    );
    expect(await inviteCount(PRIVATE)).toBe(1);
  });

  it('a member who is no admin finds no league: 404', async () => {
    await setUp();
    const trecias = await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, {
      ip: '192.0.2.44',
    });
    const answer = await trecias.post(
      '/leagues/invite',
      form({ leagueID: String(PRIVATE), invitedUserID: '2' }),
    );
    expect(answer.status).toBe(404);
    expect(await inviteCount(PRIVATE)).toBe(0);
  });

  const search = (browser: Browser, query: string, league = PRIVATE) =>
    browser.get(
      `/leagues/searchUsers?leagueID=${String(league)}&query=${encodeURIComponent(query)}`,
    );

  it('finds a player by an accent-free fragment, as id, username, name and surname only', async () => {
    const { jonas } = await setUp();
    // Šarūnas has an account and plays nothing; ruledRules search tournament players only (R-88).
    expect(JSON.parse((await search(jonas, 'zuk')).html)).toEqual([
      { id: '2', username: 'zuk', name: 'Žilvinas', surname: 'Žukauskas' },
    ]);
    expect(JSON.parse((await search(jonas, 'ZILV')).html)).toHaveLength(1);
    expect((await search(jonas, 'zuk')).html).not.toContain('@');
  });

  it("finds only the tournament's players, never one who plays nothing (R-88, ruledRules)", async () => {
    const { jonas } = await setUp();
    expect(JSON.parse((await search(jonas, 'sarunas')).html)).toEqual([]);
  });

  it('answers none under two characters, and leaves out members', async () => {
    const { jonas } = await setUp();
    expect(JSON.parse((await search(jonas, 'z')).html)).toEqual([]);
    expect(JSON.parse((await search(jonas, 'trecias')).html)).toEqual([]);
  });

  it('a non-admin finds no league (404), a guest gets 401, a malformed leagueID is a 422', async () => {
    const { jonas } = await setUp();
    const trecias = await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, {
      ip: '192.0.2.44',
    });
    expect((await search(trecias, 'zuk')).status).toBe(404);
    const guest = await search(new Browser(baseUrl, '192.0.2.62'), 'zuk');
    expect(guest.status).toBe(401);
    const bad = await jonas.get('/leagues/searchUsers?leagueID=abc&query=zuk');
    expect(bad.status).toBe(422);
    const array = await jonas.get(
      `/leagues/searchUsers?leagueID=${String(PRIVATE)}&query[]=zuk`,
    );
    expect(array.status).toBe(422);
    expect(JSON.parse(array.html)).toMatchObject({
      message: 'The query field must be a string.',
    });
  });

  it('is limited to 30 a minute per account: the 31st is a 429', async () => {
    const { jonas } = await setUp();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect((await search(jonas, 'zuk')).status).toBe(200);
    }
    const refused = await search(jonas, 'zuk');
    expect(refused.status).toBe(429);
    expect(JSON.parse(refused.html)).toMatchObject({ success: false });
  });
});

describe('POST /leagues/accept and /leagues/decline', () => {
  async function invited(): Promise<{
    readonly jonas: Browser;
    readonly zuk: Browser;
    readonly invite: number;
  }> {
    const { jonas, zuk } = await setUp();
    await jonas.post(
      '/leagues/invite',
      form({ leagueID: String(PRIVATE), invitedUserID: '2' }),
      FROM_LEAGUES,
    );
    const { rows } = await client.query(
      'select id from league_invites where league_id = $1',
      [PRIVATE],
    );
    const [row] = z.array(z.object({ id: z.int() })).parse(rows);
    return { jonas, zuk, invite: row?.id ?? 0 };
  }

  it('accepting makes a plain member who is not selected, and the invite is gone', async () => {
    const { zuk, invite } = await invited();
    const before = await selected(2);
    const answer = await zuk.post(
      '/leagues/accept',
      form({ inviteID: String(invite) }),
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(LEAGUES_PATH);
    expect(messageOn(await zuk.get(LEAGUES_PATH))).toBe(
      'Prisijungta prie lygos',
    );
    expect(await memberCount(PRIVATE, 2)).toBe(1);
    expect(await inviteCount(PRIVATE)).toBe(0);
    expect(await selected(2)).toBe(before);
    const { rows } = await client.query(
      'select is_admin, is_guest from league_members where league_id = $1 and player_id = 2',
      [PRIVATE],
    );
    expect(rows).toEqual([{ is_admin: false, is_guest: false }]);
  });

  it('accepting after leaving the tournament says to join it first, and the invite stays (R-20)', async () => {
    const { zuk, invite } = await invited();
    await client.query(
      'delete from tournament_players where player_id = 2 and tournament_id = $1',
      [CLOSED.id],
    );
    const answer = await zuk.post(
      '/leagues/accept',
      form({ inviteID: String(invite) }),
    );
    expect(answer.status).toBe(303);
    expect(messageOn(await zuk.get(LEAGUES_PATH))).toBe(
      'Pirmiausia prisijunkite prie šio turnyro.',
    );
    expect(await memberCount(PRIVATE, 2)).toBe(0);
    expect(await inviteCount(PRIVATE)).toBe(1);
  });

  it("another player's invite is not found, by accept and by decline", async () => {
    const { jonas, invite } = await invited();
    expect(
      (await jonas.post('/leagues/accept', form({ inviteID: String(invite) })))
        .status,
    ).toBe(404);
    expect(
      (await jonas.post('/leagues/decline', form({ inviteID: String(invite) })))
        .status,
    ).toBe(404);
    expect(await inviteCount(PRIVATE)).toBe(1);
  });

  it('declining deletes the invite; a second decline is not found', async () => {
    const { zuk, invite } = await invited();
    const answer = await zuk.post(
      '/leagues/decline',
      form({ inviteID: String(invite) }),
    );
    expect(answer.status).toBe(303);
    expect(messageOn(await zuk.get(LEAGUES_PATH))).toBe('Kvietimas atmestas');
    expect(await inviteCount(PRIVATE)).toBe(0);
    expect(
      (await zuk.post('/leagues/decline', form({ inviteID: String(invite) })))
        .status,
    ).toBe(404);
  });

  it('a malformed inviteID is a 422 and an integer no invite has a 404', async () => {
    const { zuk } = await invited();
    expect(
      (await zuk.post('/leagues/accept', form({ inviteID: 'x' }))).status,
    ).toBe(422);
    expect(
      (await zuk.post('/leagues/accept', form({ inviteID: '999999' }))).status,
    ).toBe(404);
    expect(
      (await zuk.post('/leagues/accept', form({ inviteID: '0' }))).status,
    ).toBe(404);
  });
});

describe('POST /leagues/leave (LeagueController::leaveLeague)', () => {
  it('leaving the selected league lands the player in the public league, and /main shows everyone again', async () => {
    const { jonas } = await setUp();
    await othersLeague();
    await client.query(
      'update tournament_players set selected_league_id = $1 where player_id = 1 and tournament_id = $2',
      [OTHERS, CLOSED.id],
    );
    expect(tableOf(await jonas.get('/main'))).toEqual(['jonas', 'zuk']);
    const answer = await jonas.post(
      '/leagues/leave',
      form({ leagueID: String(OTHERS) }),
      FROM_LEAGUES,
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(LEAGUES_PATH);
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe('Palikote lygą');
    expect(await memberCount(OTHERS, 1)).toBe(0);
    expect(await selected(1)).not.toBe(OTHERS);
    expect(tableOf(await jonas.get('/main'))).toEqual([
      'jonas',
      'trecias',
      'zuk',
    ]);
  });

  it('the owner is told to hand the league over first, and stays a member', async () => {
    const { jonas } = await setUp();
    const answer = await jonas.post(
      '/leagues/leave',
      form({ leagueID: String(PRIVATE) }),
      FROM_LEAGUES,
    );
    expect(answer.status).toBe(303);
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe(
      'Perduokite lygos valdymą kitam nariui prieš išeidami',
    );
    expect(await memberCount(PRIVATE, 1)).toBe(1);
  });

  it('the public league cannot be left', async () => {
    const { jonas } = await setUp();
    const { rows } = await client.query(
      'select id from leagues where is_public and tournament_id = $1',
      [CLOSED.id],
    );
    const [row] = z.array(z.object({ id: z.int() })).parse(rows);
    const answer = await jonas.post(
      '/leagues/leave',
      form({ leagueID: String(row?.id ?? 0) }),
      FROM_LEAGUES,
    );
    expect(answer.status).toBe(303);
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe(
      'Negalima palikti Bendros lygos',
    );
  });

  it('a league the player is no member of is not found', async () => {
    const { jonas } = await setUp();
    await othersLeague();
    await client.query(
      'delete from league_members where league_id = $1 and player_id = 1',
      [OTHERS],
    );
    expect(
      (await jonas.post('/leagues/leave', form({ leagueID: String(OTHERS) })))
        .status,
    ).toBe(404);
  });

  it('a malformed leagueID is a 422', async () => {
    const { jonas } = await setUp();
    expect(
      (await jonas.post('/leagues/leave', form({ leagueID: '1.5' }))).status,
    ).toBe(422);
  });
});

describe('POST /leagues/delete (LeagueController::deleteLeague)', () => {
  it('the owner deletes: every selecting member goes to the public league, messages are detached, members and invites go', async () => {
    const { jonas } = await setUp();
    await client.query(
      'update tournament_players set selected_league_id = $1 where player_id in (1, 3) and tournament_id = $2',
      [PRIVATE, CLOSED.id],
    );
    await client.query(
      'insert into league_invites (league_id, invitee_id, invited_by_id) values ($1, 2, 1)',
      [PRIVATE],
    );
    await client.query(
      "insert into messages (league_id, text, active) values ($1, 'Labas', true)",
      [PRIVATE],
    );
    const answer = await jonas.post(
      '/leagues/delete',
      form({ leagueID: String(PRIVATE) }),
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(LEAGUES_PATH);
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe('Lyga ištrinta');
    expect(
      await countOf('select count(*) as n from leagues where id = $1', [
        PRIVATE,
      ]),
    ).toBe(0);
    expect(await countOf('select count(*) as n from league_invites')).toBe(0);
    expect(
      await countOf(
        'select count(*) as n from messages where league_id is null',
      ),
    ).toBe(1);
    expect(await selected(1)).not.toBe(PRIVATE);
    expect(await selected(3)).not.toBe(PRIVATE);
  });

  it('a player who is not the owner is refused with a 403, and nothing is deleted', async () => {
    await setUp();
    const trecias = await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, {
      ip: '192.0.2.44',
    });
    const answer = await trecias.post(
      '/leagues/delete',
      form({ leagueID: String(PRIVATE) }),
    );
    expect(answer.status).toBe(403);
    expect(await leagueNamed('Draugų lyga')).toBe(1);
  });

  it('a league that is not there is a 404', async () => {
    const { jonas } = await setUp();
    expect(
      (await jonas.post('/leagues/delete', form({ leagueID: '99999' }))).status,
    ).toBe(404);
  });
});

describe('POST /leagues/transfer (R-23, R-119)', () => {
  it('hands the league to a member; the old owner stays an admin and may then leave, the new owner may not', async () => {
    const { jonas } = await setUp();
    const trecias = await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, {
      ip: '192.0.2.44',
    });
    const answer = await jonas.post(
      '/leagues/transfer',
      form({ leagueID: String(PRIVATE), memberID: '3' }),
      FROM_LEAGUES,
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(LEAGUES_PATH);
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe(
      'Lygos valdymas perduotas',
    );
    const { rows } = await client.query(
      'select owner_id from leagues where id = $1',
      [PRIVATE],
    );
    expect(rows).toEqual([{ owner_id: 3 }]);
    const owner = rowsOf(await trecias.get(LEAGUES_PATH)).find((row) =>
      row.includes('Draugų lyga'),
    );
    expect(owner).toContain('Savininkas');
    await trecias.post(
      '/leagues/leave',
      form({ leagueID: String(PRIVATE) }),
      FROM_LEAGUES,
    );
    expect(await memberCount(PRIVATE, 3)).toBe(1);
    const left = await jonas.post(
      '/leagues/leave',
      form({ leagueID: String(PRIVATE) }),
      FROM_LEAGUES,
    );
    expect(left.status).toBe(303);
    expect(await memberCount(PRIVATE, 1)).toBe(0);
  });

  it.each([
    ['2', 'Valdymą galima perduoti tik šios lygos nariui'],
    ['1', 'Jūs jau esate šios lygos savininkas'],
  ])(
    'refuses member %s with a message, and nothing changes',
    async (member, text) => {
      const { jonas } = await setUp();
      const answer = await jonas.post(
        '/leagues/transfer',
        form({ leagueID: String(PRIVATE), memberID: member }),
        FROM_LEAGUES,
      );
      expect(answer.status).toBe(303);
      expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe(text);
      const { rows } = await client.query(
        'select owner_id from leagues where id = $1',
        [PRIVATE],
      );
      expect(rows).toEqual([{ owner_id: 1 }]);
    },
  );

  it('a member who is not the owner is refused with a message', async () => {
    await setUp();
    const trecias = await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, {
      ip: '192.0.2.44',
    });
    const answer = await trecias.post(
      '/leagues/transfer',
      form({ leagueID: String(PRIVATE), memberID: '3' }),
      FROM_LEAGUES,
    );
    expect(answer.status).toBe(303);
    expect(messageOn(await trecias.get(LEAGUES_PATH))).toBe(
      'Lygos valdymą gali perduoti tik jos savininkas',
    );
  });

  it('the public league cannot be handed over', async () => {
    const { jonas } = await setUp();
    const { rows } = await client.query(
      'select id from leagues where is_public and tournament_id = $1',
      [CLOSED.id],
    );
    const [row] = z.array(z.object({ id: z.int() })).parse(rows);
    await jonas.post(
      '/leagues/transfer',
      form({ leagueID: String(row?.id ?? 0), memberID: '3' }),
      FROM_LEAGUES,
    );
    expect(messageOn(await jonas.get(LEAGUES_PATH))).toBe(
      'Viešos lygos valdymo perduoti negalima',
    );
  });

  it('a malformed memberID is a 422 and one no account has a 404', async () => {
    const { jonas } = await setUp();
    expect(
      (
        await jonas.post(
          '/leagues/transfer',
          form({ leagueID: String(PRIVATE), memberID: 'x' }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await jonas.post(
          '/leagues/transfer',
          form({ leagueID: String(PRIVATE), memberID: '0' }),
        )
      ).status,
    ).toBe(404);
  });
});
