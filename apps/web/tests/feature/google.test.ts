import { advanceIdentitySequences, deleteAccount } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { playerId } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { isoSecond, now } from '../../src/server/clock';
import { challengeOf } from '../../src/server/google/pkce';
import {
  fixtureCode,
  type FixtureClaims,
} from '../../src/server/google/google-fixture';
import { seal } from '../../src/server/sealed';
import {
  JONAS_ACCOUNT,
  JONAS_EMAIL,
  saveAccounts as insertAccounts,
  ZUKAUSKAS_ACCOUNT,
} from '../support/accounts';
import { appEnv, startServer, TEST_AUTH_SECRET } from '../support/app';
import {
  Browser,
  documentOf,
  setCookieFor,
  type Page,
} from '../support/browser';
import { signedInBrowser } from '../support/hub';
import {
  CLOSED,
  LATER,
  saveTournamentWithGames,
  SOONER,
} from '../support/registration';
import { serverLogSince } from '../support/server-log';

// Slice 19 (#40): GET /auth/google and its callback against the built app,
// on the fixture provider, mirroring sportbet's GoogleAuthTest (3eb95e7) and
// adding what the new flow refuses (spec: Testing, Feature).

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const databaseUrl = inject('databaseUrl');
const serverLogPath = inject('serverLogPath');
const { db, client } = useTestDatabase();

const GOOGLE = '__Host-sb_google';
const SESSION = '__Host-sb_session';
const FLASH = '__Host-sb_flash';
const SECRET = TEST_AUTH_SECRET;
const CALLBACK = '/auth/google/callback';

const FAILED = 'Google prisijungimas nepavyko. Bandykite dar kartą.';
const UNVERIFIED = 'Google paskyros el. paštas nepatvirtintas.';

let visitorNumber = 100;
/** A new visitor from an address of their own (the throttles are per address). */
const visitor = (): Browser => {
  visitorNumber += 1;
  return new Browser(baseUrl, `192.0.2.${String(visitorNumber)}`);
};

const NEW_PERSON: FixtureClaims = {
  sub: '100000000000000000001',
  email: 'nauja.zaideja@example.test',
  emailVerified: true,
  name: 'Nauja Žaidėja',
};

const TRIP = {
  state: 'the-state-of-this-trip',
  nonce: 'the-nonce-of-this-trip',
  verifier: 'the-verifier-of-this-trip-0123456789',
};

/** What a trip's cookie says, sealed as the app seals it, begun `ago` ms back. */
const tripCookie = (ago = 0, purpose = 'google-oauth', secret = SECRET) =>
  seal(purpose, { ...TRIP, at: isoSecond(Date.now() - ago) }, secret);

/** The callback's address for an identity: a code made for this trip, and this trip's state. */
function callbackFor(
  claims: FixtureClaims,
  overrides: { nonce?: string; challenge?: string; state?: string } = {},
): string {
  const code = fixtureCode(
    {
      claims,
      challenge: overrides.challenge ?? challengeOf(TRIP.verifier),
      nonce: overrides.nonce ?? TRIP.nonce,
    },
    SECRET,
    now(),
  );
  return `${CALLBACK}?${new URLSearchParams({ code, state: overrides.state ?? TRIP.state }).toString()}`;
}

/** The visitor's browser holds this trip, and arrives from Google as `claims`. */
function arrive(
  browser: Browser,
  claims: FixtureClaims,
  overrides: Parameters<typeof callbackFor>[1] = {},
): Promise<Page> {
  browser.setCookie(GOOGLE, tripCookie());
  return browser.get(callbackFor(claims, overrides));
}

const alertAfter = async (browser: Browser): Promise<string | null> =>
  documentOf(await browser.get('/')).querySelector(
    '[role="alert"], [role="status"]',
  )?.textContent ?? null;

const rowsOf = async <T extends z.ZodType>(
  shape: T,
  sql: string,
  params: unknown[] = [],
): Promise<z.infer<T>[]> =>
  z.array(shape).parse((await client.query(sql, params)).rows);

const players = () =>
  rowsOf(
    z.object({
      id: z.int(),
      username: z.string(),
      name: z.string(),
      surname: z.string(),
      email: z.string(),
      google_id: z.string().nullable(),
    }),
    'select id, username, name, surname, email, google_id from players order by id',
  );

const audit = () =>
  rowsOf(
    z.object({ player_id: z.int(), method: z.string() }),
    'select player_id, method from audit_logins order by id',
  );

const countOf = async (table: string): Promise<number | undefined> =>
  (
    await rowsOf(
      z.object({ n: z.int() }),
      `select count(*)::int as n from ${table}`,
    )
  )[0]?.n;

const sessionCount = () => countOf('sessions');

/** Nobody was signed in, nothing was made, and the trip's cookie was cleared. */
async function expectRefused(page: Page, browser: Browser): Promise<void> {
  expect(page.status).toBe(303);
  expect(page.location).toBe('/');
  expect(setCookieFor(page, SESSION)).toBeUndefined();
  expect(setCookieFor(page, GOOGLE)).toMatch(/Max-Age=0/);
  expect(browser.cookie(GOOGLE)).toBeUndefined();
  expect(await sessionCount()).toBe(0);
  expect(await audit()).toEqual([]);
}

/** Accounts saved, the identity sequences moved past their ids, so an account made afterwards gets a new one. */
const saveAccounts = async (
  database: typeof db,
  accounts: Parameters<typeof insertAccounts>[1],
): Promise<void> => {
  await insertAccounts(database, accounts);
  await advanceIdentitySequences(database);
};

beforeEach(async () => {
  await advanceIdentitySequences(db);
});

describe('GET /auth/google (redirectToGoogle)', () => {
  it('redirects to the provider with state, nonce and the PKCE challenge, setting the sealed trip cookie with its flags, never cached', async () => {
    const browser = visitor();
    const page = await browser.get('/auth/google');
    expect(page.status).toBe(303);
    const url = new URL(page.location ?? '', baseUrl);
    expect(url.pathname).toBe('/auth/google/fixture');
    const { state, nonce, challenge } = Object.fromEntries(url.searchParams);
    expect([state, nonce, challenge].map((v) => v?.length)).toEqual([
      43, 43, 43,
    ]);
    const cookie = setCookieFor(page, GOOGLE);
    expect(cookie).toMatch(/Max-Age=600/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(page.setCookies.join('\n')).not.toContain(challenge ?? 'x');
    const response = await fetch(new URL('/auth/google', baseUrl), {
      redirect: 'manual',
      headers: { 'X-Forwarded-For': '192.0.2.199' },
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('sends a signed-in visitor home before minting anything', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
      ip: '192.0.2.198',
    });
    const page = await browser.get('/auth/google');
    expect(page.status).toBe(303);
    expect(page.location).toBe('/main');
    expect(setCookieFor(page, GOOGLE)).toBeUndefined();
  });

  it('mints a new trip every time', async () => {
    const browser = visitor();
    const first = await browser.get('/auth/google');
    const second = await browser.get('/auth/google');
    expect(first.location).not.toBe(second.location);
    expect(setCookieFor(first, GOOGLE)).not.toBe(setCookieFor(second, GOOGLE));
  });

  it('allows 20 starts in ten minutes per address, then the failure message and no trip', async () => {
    const browser = visitor();
    for (let start = 0; start < 20; start += 1) {
      expect((await browser.get('/auth/google')).status).toBe(303);
    }
    const refused = await browser.get('/auth/google');
    expect(refused.status).toBe(303);
    expect(refused.location).toBe('/');
    expect(setCookieFor(refused, GOOGLE)).toBeUndefined();
    expect(await alertAfter(browser)).toBe(FAILED);
  });

  it('is a trip that completes: the fixture page, the pick, the callback, signed in as the person the page said', async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = visitor();
    const start = await browser.get('/auth/google');
    const consent = await browser.get(start.location ?? '');
    expect(consent.status).toBe(200);
    const form = documentOf(consent).querySelector('form');
    expect(form?.getAttribute('action')).toBe('/auth/google/fixture');
    const body = new FormData();
    for (const input of form?.querySelectorAll('input[name]') ?? []) {
      body.set(
        input.getAttribute('name') ?? '',
        input.getAttribute('value') ?? '',
      );
    }
    body.set('verified', 'true');
    const picked = await browser.post('/auth/google/fixture', body);
    expect(picked.status).toBe(303);
    expect(picked.location).toMatch(
      /^\/auth\/google\/callback\?code=.+&state=.+/,
    );
    const done = await browser.get(picked.location ?? '');
    expect(done.status).toBe(303);
    expect(done.location).toBe('/main');
    expect(setCookieFor(done, SESSION)).toBeDefined();
    expect((await players()).map(({ username }) => username)).toEqual([
      'new.person',
    ]);
  });
});

describe('the callback: an account that exists', () => {
  it('existing google user is logged in: by the sub, to the game page, audited google', async () => {
    await saveAccounts(db, [JONAS_ACCOUNT]);
    await client.query("update players set google_id = '555' where id = 1");
    const browser = visitor();
    const page = await arrive(browser, {
      sub: '555',
      email: 'someone.else@example.test',
      emailVerified: true,
      name: 'X',
    });
    expect(page.status).toBe(303);
    expect(page.location).toBe('/main');
    expect(setCookieFor(page, SESSION)).toBeDefined();
    expect(await audit()).toEqual([{ player_id: 1, method: 'google' }]);
    expect(await players()).toHaveLength(1);
  });

  it('an already linked account still signs in, whatever Google says of the address: unverified, absent', async () => {
    await saveAccounts(db, [JONAS_ACCOUNT]);
    await client.query("update players set google_id = '555' where id = 1");
    for (const emailVerified of [false, undefined, 'true']) {
      const page = await arrive(visitor(), {
        sub: '555',
        email: undefined,
        emailVerified,
        name: undefined,
      });
      expect(page.location).toBe('/main');
    }
    expect(await audit()).toHaveLength(3);
  });

  it('email match auto-links google id and logs in, the address written by no one but Jonas', async () => {
    await saveAccounts(db, [JONAS_ACCOUNT]);
    const browser = visitor();
    const page = await arrive(browser, {
      sub: '777',
      email: JONAS_EMAIL.toUpperCase(),
      emailVerified: true,
      name: 'Jonas Google',
    });
    expect(page.location).toBe('/main');
    expect(await audit()).toEqual([{ player_id: 1, method: 'google' }]);
    expect(await players()).toEqual([
      expect.objectContaining({
        id: 1,
        google_id: '777',
        email: JONAS_EMAIL,
        username: 'jonas',
        name: 'Jonas',
        surname: 'Petraitis',
      }),
    ]);
  });

  it('the callback always sets the remember token: the session lives 90 days, a 43-character token', async () => {
    await saveAccounts(db, [JONAS_ACCOUNT]);
    const page = await arrive(visitor(), {
      sub: '1001',
      email: JONAS_EMAIL,
      emailVerified: true,
      name: undefined,
    });
    const cookie = setCookieFor(page, SESSION) ?? '';
    expect(cookie).toMatch(/Max-Age=7776000/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/=[A-Za-z0-9_-]{43}\./);
  });

  it('a session id is new in each of the three ways in (sub, address, registration)', async () => {
    await saveTournamentWithGames(db, SOONER);
    await saveAccounts(db, [JONAS_ACCOUNT, ZUKAUSKAS_ACCOUNT]);
    await client.query("update players set google_id = '555' where id = 2");
    const tokens = new Set<string>();
    const ways: FixtureClaims[] = [
      {
        sub: '555',
        email: undefined,
        emailVerified: undefined,
        name: undefined,
      },
      { sub: '556', email: JONAS_EMAIL, emailVerified: true, name: undefined },
      NEW_PERSON,
    ];
    for (const claims of ways) {
      const page = await arrive(visitor(), claims);
      expect(page.location).toBe('/main');
      tokens.add(
        /=([A-Za-z0-9_-]{43})\./.exec(setCookieFor(page, SESSION) ?? '')?.[1] ??
          '',
      );
    }
    expect(tokens.size).toBe(3);
    expect(await sessionCount()).toBe(3);
  });

  it('goes back to the guarded page the visitor came from, and only that', async () => {
    await saveAccounts(db, [JONAS_ACCOUNT]);
    await client.query("update players set google_id = '555' where id = 1");
    const browser = visitor();
    browser.setCookie('__Host-sb_return', '/prediction/results');
    const page = await arrive(browser, {
      sub: '555',
      email: undefined,
      emailVerified: undefined,
      name: undefined,
    });
    expect(page.location).toBe('/prediction/results');
    const other = visitor();
    other.setCookie('__Host-sb_return', '//evil.example');
    const refused = await arrive(other, {
      sub: '555',
      email: undefined,
      emailVerified: undefined,
      name: undefined,
    });
    expect(refused.location).toBe('/main');
  });
});

describe('the callback: refusals that sign nobody in', () => {
  it('an unverified address does not adopt an existing account', async () => {
    await saveAccounts(db, [JONAS_ACCOUNT]);
    const browser = visitor();
    const page = await arrive(browser, {
      sub: '777',
      email: JONAS_EMAIL,
      emailVerified: false,
      name: undefined,
    });
    await expectRefused(page, browser);
    expect((await players())[0]?.google_id).toBeNull();
    expect(await alertAfter(browser)).toBe(UNVERIFIED);
  });

  it('a missing claim counts as unverified; the string "true" and 1 do too', async () => {
    await saveAccounts(db, [JONAS_ACCOUNT]);
    for (const emailVerified of [undefined, 'true', 1]) {
      const browser = visitor();
      const page = await arrive(browser, {
        sub: '777',
        email: JONAS_EMAIL,
        emailVerified,
        name: undefined,
      });
      await expectRefused(page, browser);
      expect(await alertAfter(browser)).toBe(UNVERIFIED);
    }
    expect((await players())[0]?.google_id).toBeNull();
  });

  it('an unverified address does not create an account', async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = visitor();
    const page = await arrive(browser, { ...NEW_PERSON, emailVerified: false });
    await expectRefused(page, browser);
    expect(await players()).toEqual([]);
  });

  it('an identity with no address is unverified, creating nothing', async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = visitor();
    const page = await arrive(browser, { ...NEW_PERSON, email: undefined });
    await expectRefused(page, browser);
    expect(await players()).toEqual([]);
  });

  it('a google email that only folds onto an account does not adopt it (#41)', async () => {
    await saveAccounts(db, [ZUKAUSKAS_ACCOUNT]);
    const browser = visitor();
    const page = await arrive(browser, {
      sub: '888',
      email: 'zukauskas@example.lt',
      emailVerified: true,
      name: 'Z',
    });
    await expectRefused(page, browser);
    expect((await players())[0]?.google_id).toBeNull();
    expect(await alertAfter(browser)).toBe(FAILED);
  });

  it('registration is refused when only a folded address exists, creating nothing', async () => {
    await saveTournamentWithGames(db, SOONER);
    await saveAccounts(db, [ZUKAUSKAS_ACCOUNT]);
    const browser = visitor();
    const page = await arrive(browser, {
      sub: '889',
      email: 'zukauskas@example.lt',
      emailVerified: true,
      name: undefined,
    });
    await expectRefused(page, browser);
    expect(await players()).toHaveLength(1);
  });

  it('a different Google account on the address is not linked over the first, and signs nobody in (R-135 Q3)', async () => {
    await saveAccounts(db, [JONAS_ACCOUNT]);
    await client.query("update players set google_id = '555' where id = 1");
    const browser = visitor();
    const page = await arrive(browser, {
      sub: '556',
      email: JONAS_EMAIL,
      emailVerified: true,
      name: undefined,
    });
    await expectRefused(page, browser);
    expect((await players())[0]?.google_id).toBe('555');
    expect(await alertAfter(browser)).toBe(FAILED);
  });

  it('registration closed: home, no message, nothing made (R-128, R-135 Q4)', async () => {
    // The only tournament's first game has started: no tournament takes players.
    await saveTournamentWithGames(db, CLOSED);
    const browser = visitor();
    const page = await arrive(browser, NEW_PERSON);
    await expectRefused(page, browser);
    expect(await players()).toEqual([]);
    expect(await alertAfter(browser)).toBeNull();
  });
});

describe('the callback: a new Google user is created', () => {
  it('new google user is created and logged in: username from the address, name split, a player with their settings, joined to the open tournament, audited register_google', async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = visitor();
    const page = await arrive(browser, NEW_PERSON);
    expect(page.status).toBe(303);
    expect(page.location).toBe('/main');
    expect(setCookieFor(page, SESSION)).toBeDefined();
    expect(await players()).toEqual([
      expect.objectContaining({
        username: 'nauja.zaideja',
        name: 'Nauja',
        surname: 'Žaidėja',
        email: 'nauja.zaideja@example.test',
        google_id: '100000000000000000001',
      }),
    ]);
    expect(await audit()).toEqual([
      expect.objectContaining({ method: 'register_google' }),
    ]);
    expect(
      await rowsOf(
        z.object({ role: z.string(), locale: z.string() }),
        'select role, locale from player_settings where player_id = (select id from players)',
      ),
    ).toEqual([{ role: 'player', locale: 'lt' }]);
    expect(
      await rowsOf(
        z.object({ tournament_id: z.int() }),
        'select tournament_id from tournament_players where player_id = (select id from players)',
      ),
    ).toEqual([{ tournament_id: SOONER.id }]);
    expect(
      (
        await rowsOf(
          z.object({ n: z.int() }),
          'select count(*)::int as n from match_predictions where player_id = (select id from players)',
        )
      )[0]?.n,
    ).toBeGreaterThan(0);
  });

  it('joins the tournament the visitor came for', async () => {
    await saveTournamentWithGames(db, SOONER);
    await saveTournamentWithGames(db, LATER);
    const browser = visitor();
    browser.setCookie('__Host-sb_intended', LATER.tournament.slug);
    const page = await arrive(browser, NEW_PERSON);
    expect(page.location).toBe('/main');
    expect(
      (
        await rowsOf(
          z.object({ tournament_id: z.int() }),
          'select tournament_id from tournament_players where player_id = (select id from players)',
        )
      ).map(({ tournament_id }) => tournament_id),
    ).toEqual([LATER.id]);
    expect(setCookieFor(page, '__Host-sb_intended') ?? 'Max-Age=0').toMatch(
      /Max-Age=0/,
    );
  });

  it('a taken username is suffixed rather than duplicated', async () => {
    await saveTournamentWithGames(db, SOONER);
    await saveAccounts(db, [{ ...JONAS_ACCOUNT, username: 'nauja.zaideja' }]);
    const page = await arrive(visitor(), NEW_PERSON);
    expect(page.location).toBe('/main');
    expect((await players()).map(({ username }) => username)).toEqual([
      'nauja.zaideja',
      'nauja.zaideja2',
    ]);
  });

  it('the suffix skips names already taken', async () => {
    await saveTournamentWithGames(db, SOONER);
    await saveAccounts(db, [
      { ...JONAS_ACCOUNT, username: 'nauja.zaideja' },
      { ...ZUKAUSKAS_ACCOUNT, username: 'nauja.zaideja2' },
    ]);
    await arrive(visitor(), NEW_PERSON);
    expect((await players()).map(({ username }) => username)).toEqual([
      'nauja.zaideja',
      'nauja.zaideja2',
      'nauja.zaideja3',
    ]);
  });

  it('a name held by fold (case, accent) counts as taken: Šarūnas holds sarunas', async () => {
    await saveTournamentWithGames(db, SOONER);
    await saveAccounts(db, [{ ...JONAS_ACCOUNT, username: 'Šarūnas' }]);
    await arrive(visitor(), { ...NEW_PERSON, email: 'sarunas@example.test' });
    expect((await players()).map(({ username }) => username)).toEqual([
      'Šarūnas',
      'sarunas2',
    ]);
  });

  it('a free username is taken unchanged', async () => {
    await saveTournamentWithGames(db, SOONER);
    await arrive(visitor(), NEW_PERSON);
    expect((await players())[0]?.username).toBe('nauja.zaideja');
  });

  it('is signed in on a new session of its own: the account can use /main', async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = visitor();
    await arrive(browser, NEW_PERSON);
    expect((await browser.get('/main')).status).toBe(200);
  });
});

describe('the callback: what must be right before Google is asked anything', () => {
  it.each([
    ['no cookie', async (b: Browser) => b.get(callbackFor(NEW_PERSON))],
    [
      'a forged cookie',
      async (b: Browser) => {
        b.setCookie(GOOGLE, tripCookie(0, 'google-oauth', `${SECRET}-forged`));
        return b.get(callbackFor(NEW_PERSON));
      },
    ],
    [
      'a cookie of another purpose (a flash in its place)',
      async (b: Browser) => {
        b.setCookie(GOOGLE, tripCookie(0, 'flash'));
        return b.get(callbackFor(NEW_PERSON));
      },
    ],
    [
      'an expired cookie',
      async (b: Browser) => {
        b.setCookie(GOOGLE, tripCookie(11 * 60 * 1000));
        return b.get(callbackFor(NEW_PERSON));
      },
    ],
    [
      'a state that differs',
      async (b: Browser) => {
        b.setCookie(GOOGLE, tripCookie());
        return b.get(callbackFor(NEW_PERSON, { state: 'another-state' }));
      },
    ],
    [
      'a denied consent',
      async (b: Browser) => {
        b.setCookie(GOOGLE, tripCookie());
        return b.get(`${CALLBACK}?error=access_denied&state=${TRIP.state}`);
      },
    ],
    [
      'no code',
      async (b: Browser) => {
        b.setCookie(GOOGLE, tripCookie());
        return b.get(`${CALLBACK}?state=${TRIP.state}`);
      },
    ],
    [
      'a code over 2 KB',
      async (b: Browser) => {
        b.setCookie(GOOGLE, tripCookie());
        return b.get(
          `${CALLBACK}?code=${'a'.repeat(2049)}&state=${TRIP.state}`,
        );
      },
    ],
    [
      "a code of another trip: its nonce is not this browser's",
      async (b: Browser) => {
        b.setCookie(GOOGLE, tripCookie());
        return b.get(callbackFor(NEW_PERSON, { nonce: 'another-browsers' }));
      },
    ],
    [
      "a code of another trip: its PKCE challenge is not this verifier's",
      async (b: Browser) => {
        b.setCookie(GOOGLE, tripCookie());
        return b.get(callbackFor(NEW_PERSON, { challenge: 'another' }));
      },
    ],
    [
      'a stray code no one issued',
      async (b: Browser) => {
        b.setCookie(GOOGLE, tripCookie());
        return b.get(`${CALLBACK}?code=stray&state=${TRIP.state}`);
      },
    ],
  ])(
    '%s: the failure message, nobody signed in, nothing made, the cookie cleared',
    async (_name, run) => {
      await saveTournamentWithGames(db, SOONER);
      const browser = visitor();
      const page = await run(browser);
      await expectRefused(page, browser);
      expect(await players()).toEqual([]);
      expect(await alertAfter(browser)).toBe(FAILED);
    },
  );

  it('a replayed callback finds nothing: the cookie was cleared by the first', async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = visitor();
    const first = await arrive(browser, NEW_PERSON);
    expect(first.location).toBe('/main');
    const again = await browser.get(callbackFor(NEW_PERSON));
    expect(again.location).toBe('/');
    expect(setCookieFor(again, SESSION)).toBeUndefined();
    expect(await players()).toHaveLength(1);
    expect(await audit()).toHaveLength(1);
  });

  it('the cookie is cleared with its own flags and Max-Age 0 on a success too', async () => {
    await saveTournamentWithGames(db, SOONER);
    const page = await arrive(visitor(), NEW_PERSON);
    const cleared = setCookieFor(page, GOOGLE) ?? '';
    expect(cleared).toMatch(/Max-Age=0/);
    expect(cleared).toMatch(/Secure/);
    expect(cleared).toMatch(/HttpOnly/);
    expect(cleared).toMatch(/Path=\//);
  });

  it('allows 30 callbacks in ten minutes per address, then the failure message even for a good one', async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = visitor();
    for (let call = 0; call < 30; call += 1) {
      await browser.get(`${CALLBACK}?state=x`);
    }
    const throttled = await arrive(browser, NEW_PERSON);
    await expectRefused(throttled, browser);
    expect(await players()).toEqual([]);
  });

  it('a throwing step is the failure message, never an error page', async () => {
    await saveTournamentWithGames(db, SOONER);
    // The sub is a Google id of 256 characters: refused by the identity.
    const browser = visitor();
    const page = await arrive(browser, { ...NEW_PERSON, sub: 'a'.repeat(256) });
    await expectRefused(page, browser);
    expect(await players()).toEqual([]);
  });

  it('logs the outcome kind only: no code, state, sub, address or name', async () => {
    await saveTournamentWithGames(db, SOONER);
    const since = serverLogSince(serverLogPath);
    await arrive(visitor(), NEW_PERSON);
    await arrive(visitor(), {
      ...NEW_PERSON,
      sub: '100000000000000000002',
      email: 'kitas.zmogus@example.test',
      emailVerified: false,
    });
    const log = await since('google sign-in');
    expect(log).toContain('"event":"google sign-in"');
    expect(log).toContain('"outcome":"registered"');
    expect(log).toContain('"outcome":"refused-unverified"');
    for (const secret of [
      NEW_PERSON.sub,
      'nauja.zaideja',
      'Žaidėja',
      TRIP.state,
      TRIP.verifier,
      TRIP.nonce,
    ]) {
      expect(log).not.toContain(String(secret));
    }
  });
});

describe('routes sportbet dropped', () => {
  it('has no remember route: POST /auth/google/remember is a 404 (sportbet test_the_remember_route_is_gone)', async () => {
    const page = await visitor().post('/auth/google/remember');
    expect(page.status).toBe(404);
  });
});

describe('the audit page and the account afterwards', () => {
  it('records no IP in the sign-in row (R-45)', async () => {
    await saveTournamentWithGames(db, SOONER);
    await arrive(visitor(), NEW_PERSON);
    const columns = await rowsOf(
      z.object({ column_name: z.string() }),
      "select column_name from information_schema.columns where table_name = 'audit_logins' order by column_name",
    );
    expect(columns.map(({ column_name }) => column_name)).toEqual([
      'at',
      'id',
      'method',
      'player_id',
    ]);
  });

  it('after the account is deleted its Google id is free: the same person registers again', async () => {
    await saveTournamentWithGames(db, SOONER);
    await arrive(visitor(), NEW_PERSON);
    const [made] = await players();
    const deleted = await deleteAccount(db, {
      target: unwrap(playerId(String(made?.id))),
      by: 'self',
      now: now(),
    });
    expect(deleted.ok).toBe(true);
    expect(await players()).toEqual([]);
    const again = await arrive(visitor(), NEW_PERSON);
    expect(again.location).toBe('/main');
    expect(await players()).toHaveLength(1);
  });
});

describe('the settings: what a missing or refused Google stops', () => {
  const PRODUCTION = {
    SPORTBET_ENV: 'production',
    MAIL_TRANSPORT: 'resend',
    RESEND_API_KEY: 're_test_not_real',
    CRON_SECRET: 'p'.repeat(40),
    APP_URL: 'https://sportbet.lt',
  };

  /** A server beside the shared one, its own settings: those of appEnv less what `without` names. */
  async function serverWith(
    extra: Record<string, string>,
    without: readonly string[],
  ) {
    const base = Object.fromEntries(
      Object.entries(appEnv(databaseUrl, mailpitUrl)).filter(
        ([key]) => !without.includes(key),
      ),
    );
    return startServer({ ...base, ...extra });
  }

  it('GOOGLE_PROVIDER=fixture under SPORTBET_ENV=production is not configured: the failure message, and the fixture page does not exist', async () => {
    const server = await serverWith(
      {
        ...PRODUCTION,
        GOOGLE_PROVIDER: 'fixture',
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
      },
      [
        'MAIL_TRANSPORT',
        'MAILPIT_URL',
        'EUROLEAGUE_FEED',
        'EUROLEAGUE_FEED_FIXTURE',
      ],
    );
    try {
      const start = await fetch(new URL('/auth/google', server.url), {
        redirect: 'manual',
      });
      expect(start.status).toBe(303);
      expect(start.headers.get('location')).toBe('/');
      expect(start.headers.getSetCookie().join('\n')).not.toContain(GOOGLE);
      expect(start.headers.getSetCookie().join('\n')).toContain(FLASH);
      for (const method of ['GET', 'POST']) {
        const fixture = await fetch(
          new URL(
            '/auth/google/fixture?state=a&nonce=b&challenge=c',
            server.url,
          ),
          { method, redirect: 'manual' },
        );
        expect(fixture.status).toBe(404);
      }
      const callback = await fetch(
        new URL(`${CALLBACK}?code=x&state=y`, server.url),
        { redirect: 'manual' },
      );
      expect(callback.status).toBe(303);
      expect(callback.headers.get('location')).toBe('/');
    } finally {
      await server.stop();
    }
  });

  it('with no Google setting at all, every other page still renders; the dialog draws no button; the routes say the failure message', async () => {
    const server = await serverWith({}, ['GOOGLE_PROVIDER']);
    try {
      const home = await fetch(new URL('/', server.url));
      expect(home.status).toBe(200);
      const html = await home.text();
      expect(html).not.toContain('/auth/google');
      expect(html).not.toContain('Prisijungti su Google');
      for (const path of ['/rules', '/help', '/leaderboard']) {
        expect((await fetch(new URL(path, server.url))).status).toBe(200);
      }
      const start = await fetch(new URL('/auth/google', server.url), {
        redirect: 'manual',
      });
      expect(start.status).toBe(303);
      expect(start.headers.get('location')).toBe('/');
      expect(
        (await fetch(new URL('/auth/google/fixture', server.url))).status,
      ).toBe(404);
    } finally {
      await server.stop();
    }
  });

  it('the shared server, with the fixture, draws the button in the dialog on a guest page', async () => {
    const html = (await visitor().get('/')).html;
    const link = documentOf({
      path: '/',
      status: 200,
      location: null,
      html,
      setCookies: [],
    }).querySelector('#loginPane a[href="/auth/google"]');
    expect(link?.textContent).toBe('Prisijungti su Google');
  });
});
