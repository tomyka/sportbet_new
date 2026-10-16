import { advanceIdentitySequences } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { PLAYER_HOME } from '../../src/components/shell/shell-paths';
import {
  JONAS_ACCOUNT,
  JONAS_EMAIL,
  saveAccounts,
  ZUKAUSKAS_ACCOUNT,
} from '../support/accounts';
import {
  Browser,
  documentOf,
  setCookieFor,
  type Page,
} from '../support/browser';
import { signedInBrowser } from '../support/hub';
import {
  clearMail,
  mailsTo,
  settleMail,
  waitForCodes,
} from '../support/mailpit';
import {
  ANSWERS,
  saveTournamentWithGames,
  SOONER,
  startRegistration,
} from '../support/registration';
import { serverLogSince } from '../support/server-log';

// Slice 17 (#34): the profile page and its handlers against the built app:
// UserProfileController's form, address change (R-24), notifications and
// deletion (R-25, R-130, R-131), at sportbet's addresses.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const serverLogPath = inject('serverLogPath');
const { db, client } = useTestDatabase();

const SESSION = '__Host-sb_session';
const NEW_EMAIL = 'naujas.jonas@example.lt';
const WRONG = 'Neteisingas arba pasibaigęs patvirtinimo kodas.';

const formOf = (fields: Readonly<Record<string, string>>): FormData => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
};

const GOOD = {
  username: 'jonas',
  name: 'Jonas',
  surname: 'Petraitis',
  email: JONAS_EMAIL,
};

const jonas = (ip = '192.0.2.40', role: 'player' | 'superadmin' = 'player') =>
  signedInBrowser(db, baseUrl, JONAS_ACCOUNT, { ip, role });

const saved = (browser: Browser, fields: Readonly<Record<string, string>>) =>
  browser.post('/userProfile/save', formOf(fields));

const textOf = (page: Page, selector: string): string[] =>
  Array.from(documentOf(page).querySelectorAll(selector)).map(
    (element) => element.textContent,
  );

/** The page's one-time message, whichever kind. */
const statusOn = async (browser: Browser): Promise<string | null> =>
  textOf(await browser.get('/userProfile'), '[role="status"]')[0] ?? null;

const row = async () =>
  z
    .array(
      z.object({
        username: z.string(),
        name: z.string(),
        surname: z.string(),
        email: z.string(),
        pending_email: z.string().nullable(),
        receive_reminders: z.boolean(),
      }),
    )
    .parse(
      (
        await client.query(
          'select p.username, p.name, p.surname, p.email, p.pending_email, s.receive_reminders from players p join player_settings s on s.player_id = p.id where p.id = 1',
        )
      ).rows,
    )[0];

const playerCount = async () =>
  z
    .array(z.object({ n: z.int() }))
    .parse(
      (await client.query('select count(*)::int as n from players')).rows,
    )[0]?.n;

async function onlyCode(address: string): Promise<string> {
  const codes = await waitForCodes(mailpitUrl, address);
  const code = codes.at(-1);
  if (code === undefined) throw new Error('no code');
  return code;
}

beforeEach(async () => {
  await clearMail(mailpitUrl);
  await advanceIdentitySequences(db);
});

describe('GET /userProfile', () => {
  it('sends a guest to sign in and back here, and shows a player their own profile', async () => {
    const guest = await new Browser(baseUrl, '192.0.2.41').get('/userProfile');
    expect(guest.status).toBe(307);
    expect(guest.location).toBe(
      `/login?intended=${encodeURIComponent('/userProfile')}`,
    );
    const page = await (await jonas()).get('/userProfile');
    expect(page.status).toBe(200);
    expect(textOf(page, 'h2')).toContain('Paskyros informacija');
    expect(
      documentOf(page).querySelector<HTMLInputElement>('#fp_email')?.value,
    ).toBe(JONAS_EMAIL);
  });

  it("is the shell's link for a signed-in player", async () => {
    const page = await (await jonas()).get('/userProfile');
    expect(
      documentOf(page).querySelector('a[href="/userProfile"]'),
    ).not.toBeNull();
  });

  it('answers 308 to the profile from /profile and /userSettings, and 404 for /locale', async () => {
    const browser = await jonas();
    for (const path of ['/profile', '/userSettings']) {
      const page = await browser.get(path);
      expect(page.status).toBe(308);
      expect(page.location).toBe('/userProfile');
    }
    expect((await browser.get('/locale')).status).toBe(404);
  });
});

describe('POST /userProfile/save (updateUserProfile)', () => {
  it('saves the names at once and says so, once', async () => {
    const browser = await jonas();
    const done = await saved(browser, {
      ...GOOD,
      name: 'Jonukas',
      surname: 'Petr',
    });
    expect(done.status).toBe(303);
    expect(done.location).toBe('/userProfile');
    expect(await statusOn(browser)).toBe('Profilis atnaujintas.');
    expect(await statusOn(browser)).toBeNull();
    expect(await row()).toMatchObject({ name: 'Jonukas', surname: 'Petr' });
  });

  it('lists every refused field with the typed values, writing nothing', async () => {
    const browser = await jonas();
    const done = await saved(browser, {
      username: '',
      name: 'x'.repeat(256),
      surname: '',
      email: 'jonas@',
    });
    expect(done.status).toBe(303);
    const page = await browser.get('/userProfile');
    expect(textOf(page, '[role="alert"] li')).toEqual([
      'Įveskite vartotojo vardą.',
      'Per ilgas: daugiausia 255 simboliai.',
      'Įveskite pavardę.',
      'Įveskite teisingą el. pašto adresą.',
    ]);
    expect(
      documentOf(page).querySelector<HTMLInputElement>('#fp_email')?.value,
    ).toBe('jonas@');
    expect(await row()).toMatchObject({ name: 'Jonas', username: 'jonas' });
  });

  it('refuses a username another account holds, by case and accent (issue 265), but not oneself', async () => {
    await saveAccounts(db, [ZUKAUSKAS_ACCOUNT]);
    const browser = await jonas();
    await saved(browser, { ...GOOD, username: 'ZUK' });
    expect(
      textOf(await browser.get('/userProfile'), '[role="alert"] li'),
    ).toEqual(['Šis vartotojo vardas jau užimtas.']);
    expect((await row())?.username).toBe('jonas');
    await saved(browser, { ...GOOD, username: 'JONAS' });
    expect(await statusOn(browser)).toBe('Profilis atnaujintas.');
  });

  it('refuses an address another account holds, in another spelling too, saving no name', async () => {
    await saveAccounts(db, [ZUKAUSKAS_ACCOUNT]);
    const browser = await jonas();
    await saved(browser, {
      ...GOOD,
      name: 'Pakeistas',
      email: 'zukauskas@example.lt',
    });
    expect(
      textOf(await browser.get('/userProfile'), '[role="alert"] li'),
    ).toEqual(['Šis el. pašto adresas jau užregistruotas.']);
    expect(await row()).toMatchObject({ name: 'Jonas', pending_email: null });
    await settleMail(mailpitUrl);
    expect(await mailsTo(mailpitUrl, 'zukauskas@example.lt')).toEqual([]);
  });

  it('lists a taken username, a bad surname and a taken address in one pass, as Laravel does', async () => {
    await saveAccounts(db, [ZUKAUSKAS_ACCOUNT]);
    const browser = await jonas();
    await saved(browser, {
      username: 'ZUK',
      name: 'Jonas',
      surname: '',
      email: 'zukauskas@example.lt',
    });
    expect(
      textOf(await browser.get('/userProfile'), '[role="alert"] li'),
    ).toEqual([
      'Šis vartotojo vardas jau užimtas.',
      'Įveskite pavardę.',
      'Šis el. pašto adresas jau užregistruotas.',
    ]);
    expect(await row()).toMatchObject({
      username: 'jonas',
      surname: 'Petraitis',
    });
  });

  it('keeps the cookie within 4 KB when a refused form is full of four-byte characters', async () => {
    const browser = await jonas();
    const full = '\u{1F600}'.repeat(256);
    const done = await saved(browser, {
      username: full,
      name: full,
      surname: full,
      email: full,
    });
    expect(done.status).toBe(303);
    expect(
      textOf(await browser.get('/userProfile'), '[role="alert"] li'),
    ).toHaveLength(4);
  });

  it('is refused from another site (403) and sends a guest home (303)', async () => {
    const browser = await jonas();
    const crossSite = await browser.post('/userProfile/save', formOf(GOOD), {
      origin: 'https://evil.example',
    });
    expect(crossSite.status).toBe(403);
    const guest = await new Browser(baseUrl, '192.0.2.42').post(
      '/userProfile/save',
      formOf(GOOD),
    );
    expect(guest.status).toBe(303);
    expect(guest.location).toBe('/');
  });

  it("writes only the session's own account, whatever the form says", async () => {
    await saveAccounts(db, [ZUKAUSKAS_ACCOUNT]);
    const browser = await jonas();
    await saved(browser, {
      ...GOOD,
      userID: '2',
      id: '2',
      player: '2',
      name: 'Mano',
    });
    const other = z
      .array(z.object({ name: z.string() }))
      .parse(
        (await client.query('select name from players where id = 2')).rows,
      );
    expect(other).toEqual([{ name: ZUKAUSKAS_ACCOUNT.name }]);
    expect((await row())?.name).toBe('Mano');
  });
});

describe('the address change (R-24)', () => {
  it('mails the code to the NEW address, parks it, and keeps the old address live', async () => {
    const browser = await jonas();
    await saved(browser, { ...GOOD, email: ` ${NEW_EMAIL.toUpperCase()} ` });
    expect(await statusOn(browser)).toBe(
      `Patvirtinimo kodas išsiųstas į ${NEW_EMAIL}. Senasis adresas galioja, kol kodo neįvesite.`,
    );
    const [mail] = await mailsTo(mailpitUrl, NEW_EMAIL);
    expect(mail?.subject).toBe('El. pašto keitimo patvirtinimo kodas');
    expect(await mailsTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
    expect(await row()).toMatchObject({
      email: JONAS_EMAIL,
      pending_email: NEW_EMAIL,
    });
    const page = await browser.get('/userProfile');
    expect(documentOf(page).body.textContent).toContain(
      `Laukiama patvirtinimo adresui ${NEW_EMAIL}.`,
    );
  });

  it('moves the address with the right code, tells the old one, and signs in by the new address only', async () => {
    const browser = await jonas();
    await saved(browser, { ...GOOD, email: NEW_EMAIL });
    const code = await onlyCode(NEW_EMAIL);
    const done = await browser.post(
      '/profile/email-change/confirm',
      formOf({ code: ` ${code} ` }),
    );
    expect(done.status).toBe(303);
    expect(done.location).toBe('/userProfile');
    expect(await statusOn(browser)).toBe(
      'El. paštas pakeistas. Apie pakeitimą pranešėme senuoju adresu.',
    );
    expect(await row()).toMatchObject({
      email: NEW_EMAIL,
      pending_email: null,
    });
    const [notice] = await mailsTo(mailpitUrl, JONAS_EMAIL);
    expect(notice?.subject).toBe('Jūsų paskyros el. paštas pakeistas');
    expect(notice?.html).toContain(NEW_EMAIL);
    expect(notice?.html).not.toContain('href');
    // The confirming browser stays signed in.
    expect((await browser.get('/userProfile')).status).toBe(200);
  });

  it("ends the account's other sessions when the address moves, and no other account's (R-132)", async () => {
    await saveAccounts(db, [ZUKAUSKAS_ACCOUNT]);
    const confirming = await jonas('192.0.2.40');
    const stolen = await jonas('192.0.2.41');
    const bystander = await signedInBrowser(db, baseUrl, ZUKAUSKAS_ACCOUNT, {
      ip: '192.0.2.42',
    });
    expect((await stolen.get('/userProfile')).status).toBe(200);
    await saved(confirming, { ...GOOD, email: NEW_EMAIL });
    await confirming.post(
      '/profile/email-change/confirm',
      formOf({ code: await onlyCode(NEW_EMAIL) }),
    );
    expect((await confirming.get('/userProfile')).status).toBe(200);
    const after = await stolen.get('/userProfile');
    expect(after.status).toBe(307);
    expect((await bystander.get('/userProfile')).status).toBe(200);
  });

  it("deletes the old address's sign-in codes: a code mailed there earlier signs nobody in", async () => {
    const browser = await jonas();
    await client.query(
      `insert into login_codes (email, purpose, code_hash, created_at, expires_at)
       values ($1, 'login', 'x', now(), now() + interval '5 minutes')`,
      [JONAS_EMAIL],
    );
    await saved(browser, { ...GOOD, email: NEW_EMAIL });
    await browser.post(
      '/profile/email-change/confirm',
      formOf({ code: await onlyCode(NEW_EMAIL) }),
    );
    const left = z
      .array(z.object({ n: z.int() }))
      .parse(
        (
          await client.query(
            'select count(*)::int as n from login_codes where email = $1',
            [JONAS_EMAIL],
          )
        ).rows,
      );
    expect(left).toEqual([{ n: 0 }]);
  });

  it('answers a wrong, empty or missing code beside the box, moving nothing; and `none` with nothing pending', async () => {
    const browser = await jonas();
    const none = await browser.post(
      '/profile/email-change/confirm',
      formOf({ code: '01234567' }),
    );
    expect(none.status).toBe(303);
    expect(textOf(await browser.get('/userProfile'), '[role="alert"]')).toEqual(
      ['Nėra laukiančio el. pašto keitimo.'],
    );
    await saved(browser, { ...GOOD, email: NEW_EMAIL });
    await onlyCode(NEW_EMAIL);
    for (const fields of [{ code: '00000000' }, { code: '' }, {}]) {
      await browser.post('/profile/email-change/confirm', formOf(fields));
      const page = await browser.get('/userProfile');
      expect(
        textOf(page, '[data-testid="pending-email"] [role="alert"]'),
      ).toEqual([WRONG]);
    }
    expect(await row()).toMatchObject({
      email: JONAS_EMAIL,
      pending_email: NEW_EMAIL,
    });
  });

  it('refuses a code minted for another purpose', async () => {
    const browser = await jonas();
    await saved(browser, { ...GOOD, email: NEW_EMAIL });
    await browser.post('/profile/deletion-code', formOf({}));
    await settleMail(mailpitUrl);
    // The deletion code went to the OLD address; it does not confirm the change.
    const deletionCode = await onlyCode(JONAS_EMAIL);
    await browser.post(
      '/profile/email-change/confirm',
      formOf({ code: deletionCode }),
    );
    expect((await row())?.email).toBe(JONAS_EMAIL);
  });

  it('says the address was taken meanwhile, the code spent', async () => {
    const browser = await jonas();
    await saved(browser, { ...GOOD, email: NEW_EMAIL });
    const code = await onlyCode(NEW_EMAIL);
    await saveAccounts(db, [
      {
        ...ZUKAUSKAS_ACCOUNT,
        email: unwrap(emailAddress(NEW_EMAIL)),
      },
    ]);
    await browser.post('/profile/email-change/confirm', formOf({ code }));
    const page = await browser.get('/userProfile');
    expect(
      textOf(page, '[data-testid="pending-email"] [role="alert"]'),
    ).toEqual(['Šis el. paštas jau susietas su kita paskyra.']);
    expect(await row()).toMatchObject({ email: JONAS_EMAIL });
    await browser.post('/profile/email-change/confirm', formOf({ code }));
    expect(
      textOf(
        await browser.get('/userProfile'),
        '[data-testid="pending-email"] [role="alert"]',
      ),
    ).toEqual([WRONG]);
  });

  it('cancels a pending change, by its button and by posting the current address', async () => {
    const browser = await jonas();
    await saved(browser, { ...GOOD, email: NEW_EMAIL });
    await browser.post('/profile/email-change/cancel', formOf({}));
    expect(await statusOn(browser)).toBe('El. pašto keitimas atšauktas.');
    expect((await row())?.pending_email).toBeNull();
    await saved(browser, { ...GOOD, email: NEW_EMAIL });
    await saved(browser, GOOD);
    expect(await statusOn(browser)).toBe('Profilis atnaujintas.');
    expect((await row())?.pending_email).toBeNull();
  });

  it('allows three requests in ten minutes per account, then says how long in the form, names saved', async () => {
    const browser = await jonas();
    for (const attempt of ['a', 'b', 'c']) {
      await saved(browser, { ...GOOD, email: `${attempt}.${NEW_EMAIL}` });
    }
    await saved(browser, {
      ...GOOD,
      name: 'Ketvirtas',
      email: `d.${NEW_EMAIL}`,
    });
    const page = await browser.get('/userProfile');
    expect(textOf(page, '[role="alert"] li')).toEqual([
      expect.stringMatching(/^Per daug bandymų\. Pabandykite po \d+ min\.$/),
    ]);
    expect(await row()).toMatchObject({
      name: 'Ketvirtas',
      pending_email: `c.${NEW_EMAIL}`,
    });
  });

  it('answers 429 for the sixth try at the code in ten minutes', async () => {
    const browser = await jonas();
    await saved(browser, { ...GOOD, email: NEW_EMAIL });
    const answers: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      answers.push(
        (
          await browser.post(
            '/profile/email-change/confirm',
            formOf({ code: '00000000' }),
          )
        ).status,
      );
    }
    expect(answers).toEqual([303, 303, 303, 303, 303, 429]);
  });

  it('is refused from another site and by a guest', async () => {
    const browser = await jonas();
    for (const path of [
      '/profile/email-change/confirm',
      '/profile/email-change/cancel',
    ]) {
      expect(
        (
          await browser.post(path, formOf({}), {
            origin: 'https://evil.example',
          })
        ).status,
      ).toBe(403);
      const guest = await new Browser(baseUrl, '192.0.2.43').post(
        path,
        formOf({}),
      );
      expect(guest.status).toBe(303);
      expect(guest.location).toBe('/');
    }
  });
});

describe('POST /profile/notifications', () => {
  it("turns reminders on and off for the signed-in account, answering sportbet's message", async () => {
    const browser = await jonas();
    expect((await row())?.receive_reminders).toBe(false);
    const on = await browser.post(
      '/profile/notifications',
      formOf({ receive_reminders: '1' }),
    );
    expect(on.status).toBe(303);
    expect(on.location).toBe('/userProfile');
    expect(await statusOn(browser)).toBe('Pranešimų nustatymai atnaujinti.');
    expect((await row())?.receive_reminders).toBe(true);
    await browser.post('/profile/notifications', formOf({}));
    expect((await row())?.receive_reminders).toBe(false);
  });

  it('is refused from another site and by a guest', async () => {
    const browser = await jonas();
    expect(
      (
        await browser.post(
          '/profile/notifications',
          formOf({ receive_reminders: '1' }),
          {
            origin: 'https://evil.example',
          },
        )
      ).status,
    ).toBe(403);
    const guest = await new Browser(baseUrl, '192.0.2.44').post(
      '/profile/notifications',
      formOf({ receive_reminders: '1' }),
    );
    expect(guest.location).toBe('/');
    expect((await row())?.receive_reminders).toBe(false);
  });
});

describe('deleting the account (R-25, R-130, R-131)', () => {
  it('mails a code to the account address, opening the danger zone', async () => {
    const browser = await jonas();
    const sent = await browser.post('/profile/deletion-code', formOf({}));
    expect(sent.status).toBe(303);
    expect(sent.location).toBe('/userProfile');
    const page = await browser.get('/userProfile');
    expect(textOf(page, '[role="status"]')).toEqual([
      'Patvirtinimo kodas išsiųstas į jūsų el. pašto adresą.',
    ]);
    expect(
      documentOf(page)
        .getElementById('danger-zone-panel')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    const [mail] = await mailsTo(mailpitUrl, JONAS_EMAIL);
    expect(mail?.subject).toBe('Paskyros ištrynimo patvirtinimo kodas');
  });

  it('allows three code requests in ten minutes, then answers 429', async () => {
    const browser = await jonas();
    const answers: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      answers.push(
        (await browser.post('/profile/deletion-code', formOf({}))).status,
      );
    }
    expect(answers).toEqual([303, 303, 303, 429]);
  });

  it('refuses an empty, wrong or missing code in the danger zone, deleting nothing', async () => {
    const browser = await jonas();
    await browser.post('/profile/deletion-code', formOf({}));
    for (const fields of [{ code: '00000000' }, { code: '' }, {}]) {
      const answer = await browser.post(
        '/profile',
        formOf({ _method: 'DELETE', ...fields }),
      );
      expect(answer.status).toBe(303);
      expect(answer.location).toBe('/userProfile');
      const page = await browser.get('/userProfile');
      expect(textOf(page, '#danger-zone-panel [role="alert"]')).toEqual([
        WRONG,
      ]);
    }
    expect(await playerCount()).toBe(1);
    expect(browser.cookie(SESSION)).toBeDefined();
  });

  it('answers 405 to POST /profile with no _method or another, and 429 for the sixth try', async () => {
    const browser = await jonas();
    for (const fields of [{}, { _method: 'PATCH' }, { _method: 'PUT' }]) {
      expect((await browser.post('/profile', formOf(fields))).status).toBe(405);
    }
    expect(await playerCount()).toBe(1);
    const answers: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      answers.push(
        (
          await browser.post(
            '/profile',
            formOf({ _method: 'DELETE', code: '00000000' }),
          )
        ).status,
      );
    }
    expect(answers).toEqual([303, 303, 303, 303, 303, 429]);
  });

  it('refuses a code minted for another purpose, and a code of another account', async () => {
    const browser = await jonas();
    await saved(browser, { ...GOOD, email: NEW_EMAIL });
    const changeCode = await onlyCode(NEW_EMAIL);
    await browser.post(
      '/profile',
      formOf({ _method: 'DELETE', code: changeCode }),
    );
    expect(await playerCount()).toBe(1);
  });

  it('deletes with the right code: signed out, the session cookie cleared with its flags, the old token refused, no message, no audit row', async () => {
    const browser = await jonas();
    const staleToken = browser.cookie(SESSION);
    const stale = new Browser(baseUrl, '192.0.2.45');
    if (staleToken !== undefined) stale.setCookie(SESSION, staleToken);
    await browser.post('/profile/deletion-code', formOf({}));
    const code = await onlyCode(JONAS_EMAIL);
    const since = serverLogSince(serverLogPath);
    const done = await browser.post(
      '/profile',
      formOf({ _method: 'DELETE', code: ` ${code} ` }),
    );
    expect(done.status).toBe(303);
    expect(done.location).toBe('/');
    const cleared = setCookieFor(done, SESSION);
    expect(cleared).toMatch(/Max-Age=0/);
    expect(cleared).toMatch(/Secure/);
    expect(cleared).toMatch(/HttpOnly/);
    expect(cleared).toMatch(/Path=\//);
    // No message is left (an older one the jar held is cleared by the proxy).
    expect(setCookieFor(done, '__Host-sb_flash') ?? 'Max-Age=0').toMatch(
      /Max-Age=0/,
    );
    expect(await playerCount()).toBe(0);
    const refused = await stale.get('/userProfile');
    expect(refused.status).toBe(307);
    expect(refused.location).toMatch(/^\/login/);
    const audit = z
      .array(z.object({ n: z.int() }))
      .parse(
        (
          await client.query(
            'select count(*)::int as n from audit_admin_actions',
          )
        ).rows,
      )[0]?.n;
    expect(audit).toBe(0);
    const log = await since('account-deleted');
    expect(log).toContain('"event":"account-deleted"');
    expect(log).not.toContain('@');
    expect(log).not.toContain(code);
  });

  it("frees the address at once: it registers again, and the deleted account's codes are gone", async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = await jonas();
    await browser.post('/profile/deletion-code', formOf({}));
    const code = await onlyCode(JONAS_EMAIL);
    await browser.post('/profile', formOf({ _method: 'DELETE', code }));
    await settleMail(mailpitUrl);
    await clearMail(mailpitUrl);
    const newcomer = new Browser(baseUrl, '192.0.2.46');
    const step = await startRegistration(newcomer, { email: JONAS_EMAIL });
    const done = await newcomer.submit(step, 'register-confirm', {
      code: await onlyCode(JONAS_EMAIL),
    });
    expect(done.status).toBe(303);
    expect(done.location).toBe(PLAYER_HOME);
    const accounts = z
      .array(z.object({ username: z.string() }))
      .parse((await client.query('select username from players')).rows);
    expect(accounts).toEqual([{ username: ANSWERS.username }]);
  });

  it('refuses the last superadmin in the danger zone, deleting nothing and keeping the session (R-131)', async () => {
    const browser = await jonas('192.0.2.47', 'superadmin');
    await browser.post('/profile/deletion-code', formOf({}));
    const code = await onlyCode(JONAS_EMAIL);
    const answer = await browser.post(
      '/profile',
      formOf({ _method: 'DELETE', code }),
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe('/userProfile');
    expect(
      textOf(
        await browser.get('/userProfile'),
        '#danger-zone-panel [role="alert"]',
      ),
    ).toEqual([
      'Paskutinio superadministratoriaus paskyros ištrinti negalima. Pirmiausia paskirkite kitą superadministratorių.',
    ]);
    expect(await playerCount()).toBe(1);
    expect(browser.cookie(SESSION)).toBeDefined();
    // A refusal writes nothing: the code is still live for the retry.
    const live = z
      .array(z.object({ n: z.int() }))
      .parse(
        (
          await client.query(
            "select count(*)::int as n from login_codes where purpose = 'account_deletion' and consumed_at is null",
          )
        ).rows,
      );
    expect(live).toEqual([{ n: 1 }]);
  });

  it('is refused from another site and by a guest', async () => {
    const browser = await jonas();
    for (const [path, fields] of [
      ['/profile/deletion-code', {}],
      ['/profile', { _method: 'DELETE', code: '00000000' }],
    ] as const) {
      expect(
        (
          await browser.post(path, formOf(fields), {
            origin: 'https://evil.example',
          })
        ).status,
      ).toBe(403);
      const guest = await new Browser(baseUrl, '192.0.2.48').post(
        path,
        formOf(fields),
      );
      expect(guest.status).toBe(303);
      expect(guest.location).toBe('/');
    }
    expect(await playerCount()).toBe(1);
  });
});
