import { insertTournamentPlayer, useTestDatabase } from '@sportbet/db/testing';
import { emailAddress, type StoredPlayer } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { PLAYER_HOME } from '../../src/components/shell/shell-paths';
import { JONAS_ACCOUNT, ZUKAUSKAS_ACCOUNT } from '../support/accounts';
import { Browser, documentOf, type Page } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { savePlaying } from '../support/predictions';
import { CLOSED } from '../support/registration';

// /leagues/{id}/payments, its two handlers (slice 12c, #29), and what the
// game page shows of the league's money, against the built app. In CLOSED
// (43) Jonas (1), Žukauskas (2) and Trečias (3) play. League 900 is Jonas's
// (owner, admin) with a fee of 20, Žukauskas a member, Trečias a guest;
// league 901 is Žukauskas's, with Jonas a plain member; league 902 is the
// public one, where Jonas carries is_admin.

const TRECIAS_ACCOUNT: StoredPlayer = {
  id: player('3'),
  username: 'trecias',
  email: unwrap(emailAddress('trecias@example.lt')),
  name: 'Trečias',
  surname: 'Trečiauskas',
};

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PRIVATE = 900;
const OTHERS = 901;
const JSON_ACCEPT = { accept: 'application/json' };

const form = (fields: Record<string, string>): FormData => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return body;
};

const savePath = (league: number) => `/leagues/${String(league)}/payments/save`;
const pagePath = (league: number) => `/leagues/${String(league)}/payments`;
const detailsPath = (league: number) =>
  `/leagues/${String(league)}/payment-details`;

async function addLeague(
  id: number,
  name: string,
  owner: number | null,
  fee: number | null,
): Promise<void> {
  await client.query(
    'insert into leagues (id, tournament_id, name, is_public, owner_id, base_fee, reward_description) overriding system value values ($1, $2, $3, $4, $5, $6, $7)',
    [
      id,
      CLOSED.id,
      name,
      owner === null,
      owner,
      fee,
      fee === null ? null : 'Prizas: 100 eur',
    ],
  );
}

async function addMember(
  league: number,
  id: number,
  { admin = false, guest = false }: { admin?: boolean; guest?: boolean } = {},
): Promise<number> {
  const { rows } = await client.query(
    'insert into league_members (league_id, player_id, is_admin, is_guest) values ($1, $2, $3, $4) returning id',
    [league, id, admin, guest],
  );
  return z.array(z.object({ id: z.int() })).parse(rows)[0]?.id ?? -1;
}

/** The tournament's public league, made when its first player joined. */
async function publicLeagueId(): Promise<number> {
  const { rows } = await client.query(
    'select id from leagues where tournament_id = $1 and is_public',
    [CLOSED.id],
  );
  return z.array(z.object({ id: z.int() })).parse(rows)[0]?.id ?? -1;
}

/** Jonas carries is_admin in the public league: the flag the payments door must still refuse. */
async function makeAdmin(league: number, id: number): Promise<number> {
  const { rows } = await client.query(
    'update league_members set is_admin = true where league_id = $1 and player_id = $2 returning id',
    [league, id],
  );
  return z.array(z.object({ id: z.int() })).parse(rows)[0]?.id ?? -1;
}

interface World {
  readonly jonas: Browser;
  readonly zuk: Browser;
  readonly trecias: Browser;
  /** Membership ids in league 900. */
  readonly members: {
    readonly jonas: number;
    readonly zuk: number;
    readonly trecias: number;
  };
  /** Žukauskas's membership in league 901 and Jonas's in 902. */
  readonly others: number;
  readonly publicLeague: number;
  readonly publicAdmin: number;
}

async function setUp(): Promise<World> {
  const jonas = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
  await savePlaying(db, client, CLOSED);
  const zuk = await signedInBrowser(db, baseUrl, ZUKAUSKAS_ACCOUNT, {
    ip: '192.0.2.41',
  });
  const trecias = await signedInBrowser(db, baseUrl, TRECIAS_ACCOUNT, {
    ip: '192.0.2.42',
  });
  for (const id of [2, 3]) {
    await insertTournamentPlayer(client, { tournament: CLOSED.id, player: id });
  }
  await addLeague(PRIVATE, 'Draugų lyga', 1, 20);
  await addLeague(OTHERS, 'Svetimų lyga', 2, null);
  const members = {
    jonas: await addMember(PRIVATE, 1, { admin: true }),
    zuk: await addMember(PRIVATE, 2),
    trecias: await addMember(PRIVATE, 3, { guest: true }),
  };
  await addMember(OTHERS, 2, { admin: true });
  const others = await addMember(OTHERS, 1);
  const publicLeague = await publicLeagueId();
  const publicAdmin = await makeAdmin(publicLeague, 1);
  return { jonas, zuk, trecias, members, others, publicLeague, publicAdmin };
}

const paidOf = async (member: number): Promise<number | null> => {
  const { rows } = await client.query(
    'select paid_cents from league_members where id = $1',
    [member],
  );
  return (
    z.array(z.object({ paid_cents: z.int().nullable() })).parse(rows)[0]
      ?.paid_cents ?? null
  );
};

const detailsRow = z.object({
  payment_beneficiary: z.string().nullable(),
  payment_iban: z.string().nullable(),
  payment_note: z.string().nullable(),
});

const detailsOf = async (league: number) => {
  const { rows } = await client.query(
    'select payment_beneficiary, payment_iban, payment_note from leagues where id = $1',
    [league],
  );
  return z.array(detailsRow).parse(rows)[0];
};

const select = (player: number, league: number) =>
  client.query(
    'update tournament_players set selected_league_id = $1 where player_id = $2 and tournament_id = $3',
    [league, player, CLOSED.id],
  );

/** The one-time message on a page (the board's empty row marks are no message). */
const messageOn = (page: Page): string | null =>
  [...documentOf(page).querySelectorAll('[role="status"], [role="alert"]')]
    .map((element) => element.textContent)
    .find((text) => text !== '') ?? null;

const textOf = (page: Page): string => documentOf(page).body.textContent;

describe('POST /leagues/{league}/payments/save, an autosave (LeaguePaymentController::update)', () => {
  it("an admin records an amount and the answer is the server's totals; the row holds cents", async () => {
    const { jonas, members } = await setUp();
    const answer = await jonas.post(
      savePath(PRIVATE),
      form({ [`paid[${String(members.zuk)}]`]: '20' }),
      JSON_ACCEPT,
    );
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.html)).toEqual({
      saved: true,
      collectedCents: 2000,
      expectedCents: 4000,
      paidCount: 1,
      memberCount: 3,
    });
    expect(await paidOf(members.zuk)).toBe(2000);
  });

  it('comma decimals are cents; a blank clears the amount', async () => {
    const { jonas, members } = await setUp();
    await jonas.post(
      savePath(PRIVATE),
      form({ [`paid[${String(members.zuk)}]`]: '12,5' }),
      JSON_ACCEPT,
    );
    expect(await paidOf(members.zuk)).toBe(1250);
    const cleared = await jonas.post(
      savePath(PRIVATE),
      form({ [`paid[${String(members.zuk)}]`]: ' ' }),
      JSON_ACCEPT,
    );
    expect(JSON.parse(cleared.html)).toMatchObject({
      collectedCents: 0,
      paidCount: 0,
    });
    expect(await paidOf(members.zuk)).toBeNull();
  });

  it("a guest member's amount is in the collected pot under sportbet's rules but not under the running ones (R-88)", async () => {
    const { jonas, members } = await setUp();
    const answer = await jonas.post(
      savePath(PRIVATE),
      form({ [`paid[${String(members.trecias)}]`]: '20' }),
      JSON_ACCEPT,
    );
    // The app runs ruledRules: a guest's money is not in the pot, but is counted as paid.
    expect(JSON.parse(answer.html)).toMatchObject({
      collectedCents: 0,
      expectedCents: 4000,
      paidCount: 1,
    });
  });

  it("a bad amount is Laravel's 422 naming paid.<id>, and nothing is written", async () => {
    const { jonas, members } = await setUp();
    const key = `paid[${String(members.zuk)}]`;
    const answer = await jonas.post(
      savePath(PRIVATE),
      form({ [key]: '-5' }),
      JSON_ACCEPT,
    );
    expect(answer.status).toBe(422);
    expect(JSON.parse(answer.html)).toEqual({
      message: `The paid.${String(members.zuk)} field must be at least 0.`,
      errors: {
        [`paid.${String(members.zuk)}`]: [
          `The paid.${String(members.zuk)} field must be at least 0.`,
        ],
      },
    });
    expect(await paidOf(members.zuk)).toBeNull();
  });

  it('validates before the admin check: a plain member gets 422 for a bad amount and 403 for a good one', async () => {
    const { zuk, members } = await setUp();
    const key = `paid[${String(members.zuk)}]`;
    const bad = await zuk.post(
      savePath(PRIVATE),
      form({ [key]: 'x' }),
      JSON_ACCEPT,
    );
    expect(bad.status).toBe(422);
    const good = await zuk.post(
      savePath(PRIVATE),
      form({ [key]: '20' }),
      JSON_ACCEPT,
    );
    expect(good.status).toBe(403);
    expect(await paidOf(members.zuk)).toBeNull();
  });

  it("another league's member id is a 404 and nothing is written, the league's own ids included", async () => {
    const { jonas, members, others } = await setUp();
    const answer = await jonas.post(
      savePath(PRIVATE),
      form({
        [`paid[${String(members.zuk)}]`]: '20',
        [`paid[${String(others)}]`]: '20',
      }),
      JSON_ACCEPT,
    );
    expect(answer.status).toBe(404);
    expect(await paidOf(members.zuk)).toBeNull();
    expect(await paidOf(others)).toBeNull();
  });

  it('a key that is no member id is a 404', async () => {
    const { jonas } = await setUp();
    const answer = await jonas.post(
      savePath(PRIVATE),
      form({ 'paid[abc]': '20' }),
      JSON_ACCEPT,
    );
    expect(answer.status).toBe(404);
  });

  it('the public league is 403 even for a member carrying is_admin', async () => {
    const { jonas, publicLeague, publicAdmin } = await setUp();
    const answer = await jonas.post(
      savePath(publicLeague),
      form({ [`paid[${String(publicAdmin)}]`]: '20' }),
      JSON_ACCEPT,
    );
    expect(answer.status).toBe(403);
    expect(await paidOf(publicAdmin)).toBeNull();
  });

  it('an admin of league A cannot write league B: 403, nothing written', async () => {
    const { jonas, others } = await setUp();
    const answer = await jonas.post(
      savePath(OTHERS),
      form({ [`paid[${String(others)}]`]: '20' }),
      JSON_ACCEPT,
    );
    expect(answer.status).toBe(403);
    expect(await paidOf(others)).toBeNull();
  });

  it('a league that is not there is a 404, a segment that is no id as well', async () => {
    const { jonas } = await setUp();
    expect(
      (
        await jonas.post(
          savePath(999999),
          form({ 'paid[1]': '1' }),
          JSON_ACCEPT,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await jonas.post(
          savePath(999999),
          form({ 'paid[1]': 'x' }),
          JSON_ACCEPT,
        )
      ).status,
    ).toBe(404);
    expect(
      (await jonas.post('/leagues/abc/payments/save', form({ 'paid[1]': '1' })))
        .status,
    ).toBe(404);
  });

  it('a form post (no JSON) is a 303 back to the payments page with "Mokėjimai išsaugoti" once', async () => {
    const { jonas, members } = await setUp();
    const answer = await jonas.post(
      savePath(PRIVATE),
      form({ [`paid[${String(members.zuk)}]`]: '20' }),
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(pagePath(PRIVATE));
    expect(messageOn(await jonas.get(pagePath(PRIVATE)))).toBe(
      'Mokėjimai išsaugoti',
    );
    expect(messageOn(await jonas.get(pagePath(PRIVATE)))).toBeNull();
  });

  it('a post from another site is a 403; a guest is sent to /login, and answered 401 when asking for JSON', async () => {
    const { jonas, members } = await setUp();
    const fields = form({ [`paid[${String(members.zuk)}]`]: '20' });
    const cross = await jonas.post(savePath(PRIVATE), fields, {
      origin: 'https://evil.example',
    });
    expect(cross.status).toBe(403);
    const guest = new Browser(baseUrl, '192.0.2.63');
    const page = await guest.post(savePath(PRIVATE), fields);
    expect(page.status).toBe(303);
    expect(page.location).toBe('/login');
    const autosave = await guest.post(savePath(PRIVATE), fields, JSON_ACCEPT);
    expect(autosave.status).toBe(401);
    expect(await paidOf(members.zuk)).toBeNull();
  });
});

describe('POST /leagues/{league}/payment-details (LeaguePaymentController::updateDetails)', () => {
  const GOOD = {
    payment_beneficiary: 'Jonas Petraitis',
    payment_iban: 'lt12 1000 0111 0100 1000',
    payment_note: 'Ačiū',
  };

  it('stores the IBAN compact and says "Rekvizitai išsaugoti" on the payments page', async () => {
    const { jonas } = await setUp();
    const answer = await jonas.post(detailsPath(PRIVATE), form(GOOD));
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(pagePath(PRIVATE));
    expect(await detailsOf(PRIVATE)).toEqual({
      payment_beneficiary: 'Jonas Petraitis',
      payment_iban: 'LT121000011101001000',
      payment_note: 'Ačiū',
    });
    const page = await jonas.get(pagePath(PRIVATE));
    expect(messageOn(page)).toBe('Rekvizitai išsaugoti');
    const iban = documentOf(page).querySelector('#payment_iban');
    expect(iban?.getAttribute('value')).toBe('LT12 1000 0111 0100 1000');
  });

  it('blank boxes clear the details to null', async () => {
    const { jonas } = await setUp();
    await jonas.post(detailsPath(PRIVATE), form(GOOD));
    await jonas.post(detailsPath(PRIVATE), form({}));
    expect(await detailsOf(PRIVATE)).toEqual({
      payment_beneficiary: null,
      payment_iban: null,
      payment_note: null,
    });
  });

  it('a failing checksum is a 303 with the error message and writes nothing', async () => {
    const { jonas } = await setUp();
    const answer = await jonas.post(
      detailsPath(PRIVATE),
      form({ ...GOOD, payment_iban: 'LT121000011101001080' }),
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(pagePath(PRIVATE));
    expect(messageOn(await jonas.get(pagePath(PRIVATE)))).toBe(
      'Neteisingas IBAN - patikrinkite, ar nesuklydote skaitmeniu.',
    );
    expect((await detailsOf(PRIVATE))?.payment_iban).toBeNull();
  });

  it('half a pair is a 303 with the error message and writes nothing', async () => {
    const { jonas } = await setUp();
    const answer = await jonas.post(
      detailsPath(PRIVATE),
      form({ payment_beneficiary: 'Jonas' }),
    );
    expect(answer.status).toBe(303);
    expect(messageOn(await jonas.get(pagePath(PRIVATE)))).toBe(
      'Nurodykite ir gavėją, ir sąskaitą - su viena iš jų rekvizitai nerodomi.',
    );
    expect((await detailsOf(PRIVATE))?.payment_beneficiary).toBeNull();
  });

  it("a beneficiary of 71 characters is Laravel's 422", async () => {
    const { jonas } = await setUp();
    const answer = await jonas.post(
      detailsPath(PRIVATE),
      form({ ...GOOD, payment_beneficiary: 'x'.repeat(71) }),
    );
    expect(answer.status).toBe(422);
    expect(JSON.parse(answer.html)).toEqual({
      message:
        'The payment beneficiary field must not be greater than 70 characters.',
      errors: {
        payment_beneficiary: [
          'The payment beneficiary field must not be greater than 70 characters.',
        ],
      },
    });
  });

  it('a plain member is 403, the public league is 403 for its is_admin member, another league 403; nothing is written', async () => {
    const { jonas, zuk, publicLeague } = await setUp();
    expect((await zuk.post(detailsPath(PRIVATE), form(GOOD))).status).toBe(403);
    expect(
      (await jonas.post(detailsPath(publicLeague), form(GOOD))).status,
    ).toBe(403);
    expect((await jonas.post(detailsPath(OTHERS), form(GOOD))).status).toBe(
      403,
    );
    expect((await detailsOf(PRIVATE))?.payment_iban).toBeNull();
    expect((await detailsOf(OTHERS))?.payment_iban).toBeNull();
  });

  it('a league that is not there is a 404; another site is a 403; a guest goes to /login', async () => {
    const { jonas } = await setUp();
    expect((await jonas.post(detailsPath(999999), form(GOOD))).status).toBe(
      404,
    );
    expect(
      (
        await jonas.post(detailsPath(PRIVATE), form(GOOD), {
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
    const guest = await new Browser(baseUrl, '192.0.2.63').post(
      detailsPath(PRIVATE),
      form(GOOD),
    );
    expect(guest.location).toBe('/login');
  });
});

describe('GET /leagues/{league}/payments (LeaguePaymentController::edit)', () => {
  it('a guest is sent to sign in and back to the page', async () => {
    await setUp();
    const answer = await new Browser(baseUrl, '192.0.2.63').get(
      pagePath(PRIVATE),
    );
    expect(answer.status).toBe(307);
    expect(answer.location).toBe(
      `/login?intended=${encodeURIComponent(pagePath(PRIVATE))}`,
    );
  });

  it("an admin sees every member by name, the meter and the details form, with the owner's name offered", async () => {
    const { jonas } = await setUp();
    const page = await jonas.get(pagePath(PRIVATE));
    expect(page.status).toBe(200);
    const text = textOf(page);
    for (const name of [
      'Jonas Petraitis',
      'Trečias Trečiauskas',
      'Žilvinas Žukauskas',
    ]) {
      expect(text).toContain(name);
    }
    expect(text).toContain('Mokėjimai · Draugų lyga');
    expect(text).toContain('Sumokėjo 0 iš 3');
    expect(text).toContain('0.00€');
    expect(text).toContain('40.00€');
    expect(
      documentOf(page)
        .querySelector('#payment_beneficiary')
        ?.getAttribute('value'),
    ).toBe('Jonas Petraitis');
    expect(text).toContain('Svečias');
  });

  it("the Mokėjimai link is on the admin's card of the private league and not the public one", async () => {
    const { jonas } = await setUp();
    const page = await jonas.get('/leagues');
    const links = [
      ...documentOf(page).querySelectorAll('a[title="Mokėjimai"]'),
    ].map((link) => link.getAttribute('href'));
    expect(links).toEqual([pagePath(PRIVATE)]);
  });

  it('a plain member and the public league go home, an unknown league is a 404', async () => {
    const { jonas, zuk, publicLeague } = await setUp();
    const plain = await zuk.get(pagePath(PRIVATE));
    expect(plain.status).toBe(307);
    expect(plain.location).toBe('/');
    const inPublic = await jonas.get(pagePath(publicLeague));
    expect(inPublic.status).toBe(307);
    expect(inPublic.location).toBe('/');
    expect((await jonas.get(pagePath(999999))).status).toBe(404);
    expect((await jonas.get('/leagues/abc/payments')).status).toBe(404);
  });
});

describe("GET /main: the league's fee panel and messages", () => {
  it('an unpaid member sees the due line; once the admin records the payment, the paid line, and the pots follow', async () => {
    const { jonas, zuk, members } = await setUp();
    await select(2, PRIVATE);
    const due = await zuk.get(PLAYER_HOME);
    expect(textOf(due)).toContain('Dalyvio mokestis 20,00 € dar nesumokėtas.');
    expect(textOf(due)).toContain('Kaip sumokėti');
    expect(textOf(due)).toContain(
      'Dalyvių skaičius: 2, prognozuojama suma: 40.00€, surinkta suma: 0.00€',
    );
    expect(textOf(due)).toContain('Prizas: 100 eur');
    await jonas.post(
      savePath(PRIVATE),
      form({ [`paid[${String(members.zuk)}]`]: '20' }),
      JSON_ACCEPT,
    );
    const paid = await zuk.get(PLAYER_HOME);
    expect(textOf(paid)).toContain(
      'Startinis dalyvio mokestis sumokėtas. Sėkmės totalizatoriuje!',
    );
    expect(textOf(paid)).not.toContain('nesumokėtas');
    expect(textOf(paid)).toContain('surinkta suma: 20.00€');
  });

  it('the pop-up shows the three rows once the admin names where to pay, and no account number to a member who has paid', async () => {
    const { jonas, zuk, members } = await setUp();
    await select(2, PRIVATE);
    await jonas.post(
      detailsPath(PRIVATE),
      form({
        payment_beneficiary: 'Jonas Petraitis',
        payment_iban: 'LT121000011101001000',
      }),
    );
    const due = await zuk.get(PLAYER_HOME);
    expect(textOf(due)).toContain('Jonas Petraitis');
    expect(textOf(due)).toContain('LT12 1000 0111 0100 1000');
    expect(textOf(due)).toContain('Jaunimo linijai');
    await jonas.post(
      savePath(PRIVATE),
      form({ [`paid[${String(members.zuk)}]`]: '20' }),
      JSON_ACCEPT,
    );
    const paid = await zuk.get(PLAYER_HOME);
    expect(paid.html).not.toContain('LT12');
    expect(paid.html).not.toContain('1000 0111');
  });

  it('a guest member sees nothing about money (R-124): no due line, no paid line, no counts, no pop-up; the reward and the messages stay', async () => {
    const { jonas, trecias, members } = await setUp();
    await select(3, PRIVATE);
    await client.query(
      'insert into messages (league_id, text, active) values ($1, $2, true)',
      [PRIVATE, 'Sveiki atvykę'],
    );
    const before = await trecias.get(PLAYER_HOME);
    for (const money of [
      'mokestis',
      'Kaip sumokėti',
      'Dalyvių skaičius',
      'suma:',
    ]) {
      expect(before.html).not.toContain(money);
    }
    expect(textOf(before)).toContain('Prizas: 100 eur');
    expect(textOf(before)).toContain('Sveiki atvykę');
    await jonas.post(
      savePath(PRIVATE),
      form({ [`paid[${String(members.trecias)}]`]: '20' }),
      JSON_ACCEPT,
    );
    const after = await trecias.get(PLAYER_HOME);
    expect(after.html).not.toContain('Startinis dalyvio mokestis');
    expect(after.html).not.toContain('Dalyvių skaičius');
  });

  it('an active message shows and an inactive one does not, in id order, also for a league with no fee (R-122)', async () => {
    const { zuk } = await setUp();
    await select(2, OTHERS);
    await client.query(
      'insert into messages (league_id, text, active) values ($1, $2, true), ($1, $3, false), ($1, $4, true)',
      [OTHERS, 'Pirma', 'Paslėpta', 'Antra'],
    );
    const page = await zuk.get(PLAYER_HOME);
    const text = textOf(page);
    expect(text).toContain('Pirma');
    expect(text).toContain('Antra');
    expect(text.indexOf('Pirma')).toBeLessThan(text.indexOf('Antra'));
    expect(text).not.toContain('Paslėpta');
    expect(text).not.toContain('Dalyvio mokestis');
  });

  it('a message is shown as text, never as markup', async () => {
    const { zuk } = await setUp();
    await select(2, OTHERS);
    await client.query(
      'insert into messages (league_id, text, active) values ($1, $2, true)',
      [OTHERS, '<script>alert(1)</script><b>x</b>'],
    );
    const page = await zuk.get(PLAYER_HOME);
    expect(page.html).not.toContain('<script>alert(1)</script>');
    expect(textOf(page)).toContain('<script>alert(1)</script><b>x</b>');
  });

  it('switching league switches the panel: the league with a fee has it, the one without has none', async () => {
    const { zuk } = await setUp();
    await select(2, PRIVATE);
    expect(textOf(await zuk.get(PLAYER_HOME))).toContain('Dalyvio mokestis');
    const switched = await zuk.post(
      '/leagues/switch',
      form({ leagueID: String(OTHERS) }),
    );
    expect(switched.status).toBe(303);
    expect(textOf(await zuk.get(PLAYER_HOME))).not.toContain(
      'Dalyvio mokestis',
    );
  });
});
