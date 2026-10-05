import {
  advanceIdentitySequences,
  issueLoginCode,
  savePlayers,
} from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { emailAddress } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { now } from '../../src/server/clock';
import { hashLoginCode } from '../../src/server/sign-in/code-hash';
import { JONAS_ACCOUNT, JONAS_EMAIL, saveAccounts } from '../support/accounts';
import {
  Browser,
  documentOf,
  setCookieFor,
  type Page,
} from '../support/browser';
import { clearMail, settleMail, waitForCodes } from '../support/mailpit';
import {
  ANSWERS,
  CLOSED,
  LATER,
  saveTournamentWithGames,
  SOONER,
  startRegistration,
} from '../support/registration';
import { serverLogSince } from '../support/server-log';

// sportbet's RegistrationTest, RegistrationAtomicityTest,
// RegistrationDeadlineTest, RegistrationLandsInAnOpenTournamentTest and
// AuthDialogTest (3eb95e7), against the built app.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const serverLogPath = inject('serverLogPath');
const { db, client } = useTestDatabase();

const PENDING = '__Host-sb_register';
const INTENDED = '__Host-sb_intended';
const OPEN = '__Host-sb_signin_open';
const SESSION = '__Host-sb_session';
const WRONG = 'Neteisingas arba pasibaigęs kodas.';
const TAKEN =
  'Šis el. paštas arba vartotojo vardas jau užimtas. Pradėkite iš naujo.';

const visitor = (ip = '192.0.2.10') => new Browser(baseUrl, ip);

const rowsIn = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as rows from ${table}`)).rows,
    )[0]?.rows;

const dialogText = (page: Page) =>
  documentOf(page).querySelector('[role="dialog"]')?.textContent ?? '';

const registerPane = (page: Page) =>
  documentOf(page).querySelector('#registerPane');

async function onlyCode(email: string): Promise<string> {
  const [code] = await waitForCodes(mailpitUrl, email);
  if (code === undefined) throw new Error('no code');
  return code;
}

/** Steps one and two, ANSWERS with `fields` over them. */
async function registered(
  browser: Browser,
  fields: Readonly<Record<string, string>> = {},
): Promise<Page> {
  const step = await startRegistration(browser, fields);
  return browser.submit(step, 'register-confirm', {
    code: await onlyCode((fields['email'] ?? ANSWERS.email).toLowerCase()),
  });
}

const joinedTournaments = async () =>
  z
    .array(z.object({ tournament_id: z.int() }))
    .parse(
      (
        await client.query(
          'select tournament_id from tournament_players where player_id = (select id from players where username = $1)',
          [ANSWERS.username],
        )
      ).rows,
    )
    .map(({ tournament_id }) => tournament_id);

// A code still on its way must not land in the next test (settleMail).
afterEach(async () => {
  await settleMail(mailpitUrl);
});

beforeEach(async () => {
  await clearMail(mailpitUrl);
  await saveAccounts(db, [JONAS_ACCOUNT]);
  await advanceIdentitySequences(db);
});

describe('/register (RegisteredUserController::create)', () => {
  it('registration: sends a guest to / with the dialog to open on its Registruotis tab, keeping a ?tournament= slug', async () => {
    const browser = visitor();
    const sent = await browser.get('/register?tournament=euroleague-2026-27');
    expect(sent.status).toBe(302);
    expect(sent.location).toBe('/');
    expect(browser.cookie(OPEN)).toBe('register');
    expect(browser.cookie(INTENDED)).toBe('euroleague-2026-27');
    expect(setCookieFor(sent, INTENDED)).toMatch(/Max-Age=7200/);
    expect(setCookieFor(sent, INTENDED)).toMatch(/HttpOnly/);
    const home = documentOf(await browser.get('/'));
    expect(
      home
        .querySelector('[data-testid="sign-in-dialog"]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    expect(
      home.querySelector('#registerTab')?.getAttribute('aria-selected'),
    ).toBe('true');
    expect(home.querySelector('#registerPane')?.hasAttribute('hidden')).toBe(
      false,
    );
  });

  it('registration: keeps no ?tournament= that is not a slug', async () => {
    const browser = visitor();
    await browser.get('/register?tournament=Euroleague%202026');
    expect(browser.cookie(INTENDED)).toBeUndefined();
    expect(browser.cookie(OPEN)).toBe('register');
  });

  it('registration: /login keeps a ?tournament= slug for registration too, and opens on the sign-in tab', async () => {
    const browser = visitor();
    await browser.get('/login?tournament=euroleague-2027-28');
    expect(browser.cookie(INTENDED)).toBe('euroleague-2027-28');
    expect(browser.cookie(OPEN)).toBe('login');
  });

  it('registration (closed): /register goes home and opens nothing, and the dialog draws no Registruotis tab', async () => {
    await saveTournamentWithGames(db, CLOSED);
    const browser = visitor();
    const sent = await browser.get('/register?tournament=euroleague-2025-26');
    expect(sent.location).toBe('/');
    expect(browser.cookie(OPEN)).toBeUndefined();
    expect(browser.cookie(INTENDED)).toBeUndefined();
    const home = documentOf(await browser.get('/'));
    expect(home.querySelector('[role="tablist"]')).toBeNull();
    expect(
      home.querySelector('form[data-testid="register-request"]'),
    ).toBeNull();
    expect(
      home.querySelector('form[data-testid="sign-in-request"]'),
    ).not.toBeNull();
  });
});

describe('step one (RegisteredUserController::store)', () => {
  it('registration: the form creates nothing - a registration code mailed and stored as a hash, the answers in a signed cookie, the code step drawn', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    expect(step.status).toBe(200);
    expect(dialogText(step)).toContain(`Kodą išsiuntėme į ${ANSWERS.email}`);
    expect(dialogText(step)).toMatch(/Kodas galioja dar [45]:\d\d/);
    expect(
      documentOf(step).querySelector('form[data-testid="register-confirm"]'),
    ).not.toBeNull();
    expect(documentOf(step).querySelector('[role="tablist"]')).toBeNull();
    for (const flag of [/Max-Age=7200/, /HttpOnly/, /Secure/, /Path=\//]) {
      expect(setCookieFor(step, PENDING)).toMatch(flag);
    }
    const code = await onlyCode(ANSWERS.email);
    const stored = await client.query(
      'select email, purpose, code_hash from login_codes',
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      email: ANSWERS.email,
      purpose: 'registration',
    });
    expect(JSON.stringify(stored.rows)).not.toContain(code);
    expect(await rowsIn('players')).toBe(1);
    expect(await rowsIn('player_settings')).toBe(1);
    expect(await rowsIn('tournament_players')).toBe(0);
    expect(browser.cookie(SESSION)).toBeUndefined();
  });

  it('registration: an address with capitals is lowered, not refused (the owner, 2026-10-05)', async () => {
    const step = await startRegistration(visitor(), {
      email: '  Ruta.Naujoke@Example.LT ',
    });
    expect(dialogText(step)).toContain(`Kodą išsiuntėme į ${ANSWERS.email}`);
    await onlyCode(ANSWERS.email);
  });

  it('registration: a filled honeypot goes home silently - no code, nothing pending', async () => {
    const browser = visitor();
    const answer = await startRegistration(browser, { website: 'spam' });
    expect(answer.status).toBe(303);
    expect(answer.location).toBe('/');
    expect(browser.cookie(PENDING)).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await rowsIn('login_codes')).toBe(0);
  });

  it.each([
    ['no username', { username: '' }, 'Įveskite vartotojo vardą.'],
    ['no first name', { name: '' }, 'Įveskite vardą.'],
    ['no address', { email: '' }, 'Įveskite el. pašto adresą.'],
    [
      'an address that is not one',
      { email: 'ruta.naujoke' },
      'Įveskite teisingą el. pašto adresą.',
    ],
    [
      'a username over 255 characters',
      { username: 'a'.repeat(256) },
      'Per ilgas: daugiausia 255 simboliai.',
    ],
    [
      'a first name over 255 characters',
      { name: 'ž'.repeat(256) },
      'Per ilgas: daugiausia 255 simboliai.',
    ],
    [
      'a surname over 255 characters',
      { surname: 'ž'.repeat(256) },
      'Per ilgas: daugiausia 255 simboliai.',
    ],
    [
      'an address over 255 characters',
      { email: `${'a'.repeat(245)}@example.lt` },
      'Per ilgas: daugiausia 255 simboliai.',
    ],
    [
      'an address already registered',
      { email: JONAS_EMAIL },
      'Šis el. pašto adresas jau užregistruotas.',
    ],
    [
      'a second spelling of a registered address (unique:users)',
      { email: 'jonas.petraitis@exámple.lt' },
      'Šis el. pašto adresas jau užregistruotas.',
    ],
  ])(
    'registration: refuses %s with its text, under the form, and sends nothing',
    async (_label, fields, text) => {
      const browser = visitor();
      const page = await startRegistration(browser, fields);
      expect(page.status).toBe(200);
      expect(registerPane(page)?.textContent).toContain(text);
      expect(registerPane(page)?.hasAttribute('hidden')).toBe(false);
      expect(browser.cookie(PENDING)).toBeUndefined();
      expect(await rowsIn('login_codes')).toBe(0);
    },
  );

  // qa G1: RegisteredUserController::store validates unique:users with the
  // other rules, so every refused field shows at once.
  it('registration: a registered address is refused together with the other answers', async () => {
    const browser = visitor();
    const page = await startRegistration(browser, {
      username: '',
      email: JONAS_EMAIL,
    });
    expect(registerPane(page)?.textContent).toContain(
      'Įveskite vartotojo vardą.',
    );
    expect(registerPane(page)?.textContent).toContain(
      'Šis el. pašto adresas jau užregistruotas.',
    );
    expect(browser.cookie(PENDING)).toBeUndefined();
    expect(await rowsIn('login_codes')).toBe(0);
  });

  it('registration: a refused form keeps the answers typed (old())', async () => {
    const page = await startRegistration(visitor(), { username: '' });
    const field = (name: string) =>
      registerPane(page)
        ?.querySelector(`input[name="${name}"]`)
        ?.getAttribute('value');
    expect(field('name')).toBe(ANSWERS.name);
    expect(field('surname')).toBe(ANSWERS.surname);
    expect(field('email')).toBe(ANSWERS.email);
  });

  it('registration: a resend is step one again - a new code, the old one void, "Kodą išsiuntėme iš naujo." (issue 114)', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const [first] = await waitForCodes(mailpitUrl, ANSWERS.email);
    const again = await browser.submit(step, 'register-resend');
    expect(dialogText(again)).toContain('Kodą išsiuntėme iš naujo.');
    await waitForCodes(mailpitUrl, ANSWERS.email, 2);
    expect(
      (
        await client.query(
          'select count(*)::int as live from login_codes where consumed_at is null',
        )
      ).rows,
    ).toEqual([{ live: 1 }]);
    // As 4b's resend test: the old code is void (two equal codes are 1 in 10^8).
    expect(
      dialogText(
        await browser.submit(again, 'register-confirm', { code: first ?? '' }),
      ),
    ).toContain(WRONG);
  });

  it('registration: "Atgal" forgets the pending registration', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const back = await browser.submit(step, 'register-cancel');
    expect(setCookieFor(back, PENDING)).toMatch(/Max-Age=0/);
    expect(
      documentOf(back).querySelector('form[data-testid="register-request"]'),
    ).not.toBeNull();
    expect(
      documentOf(back).querySelector('form[data-testid="register-confirm"]'),
    ).toBeNull();
  });

  it('registration (closed): step one goes home and creates nothing', async () => {
    const browser = visitor();
    const page = await browser.get('/');
    await saveTournamentWithGames(db, CLOSED);
    const answer = await browser.submit(page, 'register-request', ANSWERS);
    expect(answer.status).toBe(303);
    expect(answer.location).toBe('/');
    expect(browser.cookie(PENDING)).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await rowsIn('login_codes')).toBe(0);
  });
});

describe('step two (RegisteredUserController::confirm)', () => {
  it('registration: the code creates the account, its settings and its place in the open tournament, signs it in, records register, and goes home', async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = visitor();
    const done = await registered(browser);
    expect(done.status).toBe(303);
    expect(done.location).toBe('/');
    expect(setCookieFor(done, PENDING)).toMatch(/Max-Age=0/);
    expect(browser.cookie(SESSION)).toBeDefined();
    expect(
      (
        await client.query(
          'select id, username, name, surname, email from players where id = 2',
        )
      ).rows,
    ).toEqual([{ id: 2, ...ANSWERS }]);
    expect(
      (await client.query('select * from player_settings where player_id = 2'))
        .rows,
    ).toEqual([
      { player_id: 2, locale: 'lt', admin_level: 0, last_tournament_id: null },
    ]);
    expect(await joinedTournaments()).toEqual([SOONER.id]);
    expect(
      (
        await client.query(
          'select game_id, home, away, origin from match_predictions where player_id = 2 order by game_id',
        )
      ).rows,
    ).toEqual([
      { game_id: 411, home: null, away: null, origin: 'real' },
      { game_id: 415, home: null, away: null, origin: 'real' },
    ]);
    expect(
      (
        await client.query(
          'select count(*)::int as rows from standings_predictions where player_id = 2',
        )
      ).rows,
    ).toEqual([{ rows: 2 }]);
    expect(
      (await client.query('select player_id, method from audit_logins')).rows,
    ).toEqual([{ player_id: 2, method: 'register' }]);
    const home = documentOf(await browser.get('/'));
    expect(home.querySelector('[data-testid="rail"]')?.textContent).toContain(
      'Rūta N.',
    );
    expect(
      home.querySelector('[data-testid="rail-context"]')?.textContent,
    ).toContain('Euroleague 2026/27');
    expect(home.querySelector('[data-testid="sign-in-dialog"]')).toBeNull();
    // A signed-in visitor has no registration to make (`guest`).
    const again = await browser.get('/register');
    expect(again.location).toBe('/');
    expect(browser.cookie(OPEN)).toBeUndefined();
    const posted = await browser.submit(
      await visitor('192.0.2.11').get('/'),
      'register-request',
      { ...ANSWERS, username: 'kitas', email: 'kitas@example.lt' },
    );
    expect(posted.location).toBe('/');
    expect(await rowsIn('login_codes')).toBe(1);
  });

  it('registration: a wrong code, a sign-in code for the address and an expired code all get the one answer, and nothing is created', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    const wrong = code === '00000000' ? '11111111' : '00000000';
    expect(
      dialogText(
        await browser.submit(step, 'register-confirm', { code: wrong }),
      ),
    ).toContain(WRONG);
    // sportbet's test_a_sign_in_code_cannot_complete_a_registration
    const signInCode = code === '22223333' ? '33334444' : '22223333';
    await issueLoginCode(db, {
      email: unwrap(emailAddress(ANSWERS.email)),
      purpose: 'login',
      codeHash: await hashLoginCode(signInCode),
      now: now(),
    });
    expect(
      dialogText(
        await browser.submit(step, 'register-confirm', { code: signInCode }),
      ),
    ).toContain(WRONG);
    await client.query(
      "update login_codes set expires_at = now() - interval '1 second' where purpose = 'registration'",
    );
    expect(
      dialogText(await browser.submit(step, 'register-confirm', { code })),
    ).toContain(WRONG);
    expect(await rowsIn('players')).toBe(1);
    expect(browser.cookie(SESSION)).toBeUndefined();
  });

  it('registration: a registration code never signs in (purpose scoping, #43)', async () => {
    const browser = visitor();
    await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    // A second later, so the sign-in is the step asked for last (to the second).
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const signInStep = await browser.submit(
      await visitor('192.0.2.12').get('/'),
      'sign-in-request',
      { email: ANSWERS.email },
    );
    const refused = await browser.submit(signInStep, 'sign-in-verify', {
      code,
    });
    expect(dialogText(refused)).toContain(WRONG);
    expect(browser.cookie(SESSION)).toBeUndefined();
  });

  it('registration: a code with no registration pending in this browser asks for the form first', async () => {
    const step = await startRegistration(visitor());
    const other = visitor('192.0.2.13');
    const refused = await other.submit(step, 'register-confirm', {
      code: '12345678',
    });
    expect(refused.status).toBe(200);
    expect(registerPane(refused)?.textContent).toContain(
      'Pirmiausia užpildykite registracijos formą.',
    );
    expect(await rowsIn('players')).toBe(1);
  });

  it('registration: an address registered between the two steps - taken, the pending registration forgotten, nothing created', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    await savePlayers(db, [
      {
        id: player('7'),
        username: 'kita',
        email: unwrap(emailAddress(ANSWERS.email)),
        name: 'Kita',
        surname: '',
      },
    ]);
    const taken = await browser.submit(step, 'register-confirm', { code });
    expect(taken.status).toBe(200);
    expect(registerPane(taken)?.textContent).toContain(TAKEN);
    expect(setCookieFor(taken, PENDING)).toMatch(/Max-Age=0/);
    expect(browser.cookie(SESSION)).toBeUndefined();
    expect(await rowsIn('players')).toBe(2);
  });

  it("registration: a username taken between the two steps, ignoring case and accents as sportbet's collation does - the same", async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    await savePlayers(db, [
      {
        id: player('7'),
        username: 'NAUJOKĖ',
        email: unwrap(emailAddress('kita@example.lt')),
        name: 'Kita',
        surname: '',
      },
    ]);
    const taken = await browser.submit(step, 'register-confirm', { code });
    expect(registerPane(taken)?.textContent).toContain(TAKEN);
    expect(setCookieFor(taken, PENDING)).toMatch(/Max-Age=0/);
    expect(await rowsIn('players')).toBe(2);
  });

  it('registration: any other failure is no naming conflict - its own answer, the pending registration kept, nothing created (#270)', async () => {
    const browser = visitor();
    const step = await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    await client.query(`
      create function refuse_settings() returns trigger language plpgsql
        as $$ begin raise exception 'simulated failure writing the settings row'; end $$;
      create trigger refuse_settings before insert on player_settings
        for each row execute function refuse_settings();
    `);
    try {
      const logged = serverLogSince(serverLogPath);
      const failed = await browser.submit(step, 'register-confirm', { code });
      // #18 review W3: the failure is logged by its kind, nothing personal.
      const output = await logged(
        'registration: the account could not be created',
      );
      expect(output).toContain(
        'registration: the account could not be created',
      );
      for (const personal of [
        ANSWERS.email,
        ANSWERS.username,
        ANSWERS.name,
        ANSWERS.surname,
      ]) {
        expect(output).not.toContain(personal);
      }
      expect(failed.status).toBe(200);
      expect(dialogText(failed)).toContain(
        'Registracijos užbaigti nepavyko. Bandykite dar kartą.',
      );
      expect(dialogText(failed)).not.toContain('jau užimtas');
      expect(setCookieFor(failed, PENDING)).toBeUndefined();
      expect(browser.cookie(PENDING)).toBeDefined();
      expect(
        documentOf(failed).querySelector(
          'form[data-testid="register-confirm"]',
        ),
      ).not.toBeNull();
      expect(await rowsIn('players')).toBe(1);
      expect(browser.cookie(SESSION)).toBeUndefined();
    } finally {
      await client.query(`
        drop trigger refuse_settings on player_settings;
        drop function refuse_settings();
      `);
    }
  });

  it('registration: the deadline passing between the two steps - home, the pending registration forgotten, nothing created', async () => {
    await saveTournamentWithGames(db, {
      ...SOONER,
      firstGameInDays: -10,
      deadlineInDays: 1,
    });
    const browser = visitor();
    const step = await startRegistration(browser);
    const code = await onlyCode(ANSWERS.email);
    // Round 5 starts: R-8 closes the season (sportbet: its first game).
    await client.query(
      "update games set tip_off = date_trunc('second', now()) - interval '1 minute' where id = 415",
    );
    const closed = await browser.submit(step, 'register-confirm', { code });
    expect(closed.status).toBe(303);
    expect(closed.location).toBe('/');
    expect(setCookieFor(closed, PENDING)).toMatch(/Max-Age=0/);
    expect(await rowsIn('players')).toBe(1);
    expect(browser.cookie(SESSION)).toBeUndefined();
  });
});

describe('the tournament a new account joins (PostRegisterController, R-27)', () => {
  beforeEach(async () => {
    await saveTournamentWithGames(db, SOONER);
    await saveTournamentWithGames(db, LATER);
    await saveTournamentWithGames(db, CLOSED);
  });

  it('registration: the ?tournament= one, when it takes players', async () => {
    const browser = visitor();
    await browser.get('/register?tournament=euroleague-2027-28');
    await registered(browser);
    expect(await joinedTournaments()).toEqual([LATER.id]);
    expect(browser.cookie(INTENDED)).toBeUndefined();
  });

  it('registration: an unknown slug falls back to the open tournament whose next game is soonest', async () => {
    const browser = visitor();
    await browser.get('/register?tournament=no-such-tournament');
    await registered(browser);
    expect(await joinedTournaments()).toEqual([SOONER.id]);
  });

  it('registration: a closed one falls back too, and no row is written for its games', async () => {
    const browser = visitor();
    await browser.get('/login?tournament=euroleague-2025-26');
    await registered(browser);
    expect(await joinedTournaments()).toEqual([SOONER.id]);
    expect(
      (
        await client.query(
          'select count(*)::int as rows from match_predictions where game_id in (431, 435)',
        )
      ).rows,
    ).toEqual([{ rows: 0 }]);
  });
});

it('registration: with no tournament at all, the account joins none (Q4: an empty installation stays open)', async () => {
  const browser = visitor();
  const done = await registered(browser);
  expect(done.location).toBe('/');
  expect(await joinedTournaments()).toEqual([]);
  expect(await rowsIn('player_settings')).toBe(2);
});

it('the dialog draws the step asked for last when a sign-in and a registration are both pending (AuthDialogComposer)', async () => {
  const browser = visitor();
  await startRegistration(browser);
  // sentAt is kept to the second: one apart, the sign-in is the later.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const signIn = await browser.submit(
    await visitor('192.0.2.14').get('/'),
    'sign-in-request',
    { email: JONAS_EMAIL },
  );
  expect(
    documentOf(signIn).querySelector('form[data-testid="sign-in-verify"]'),
  ).not.toBeNull();
  expect(
    documentOf(signIn).querySelector('form[data-testid="register-confirm"]'),
  ).toBeNull();
});
