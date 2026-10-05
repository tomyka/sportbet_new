import { useTestDatabase } from '@sportbet/db/testing';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { JONAS_ACCOUNT, JONAS_EMAIL, saveAccounts } from '../support/accounts';
import {
  Browser,
  documentOf,
  setCookieFor,
  type Page,
} from '../support/browser';
import {
  clearMail,
  codesTo,
  settleMail,
  waitForCodes,
} from '../support/mailpit';

// sportbet's throttle tests (EmailCodeLoginTest) and #16's CSRF notes.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const { db, client } = useTestDatabase();

const SESSION = '__Host-sb_session';
const PENDING = '__Host-sb_signin';
const THROTTLED = 'Per daug bandymų. Pabandykite dar kartą po 10 min.';
const EVIL = 'https://evil.example';

const visitor = (ip = '198.51.100.10') => new Browser(baseUrl, ip);
const dialogText = (page: Page) =>
  documentOf(page).querySelector('[role="dialog"]')?.textContent ?? '';
const rowsIn = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as rows from ${table}`)).rows,
    )[0]?.rows;

/**
 * The address form as a guest's page serves it. With a code pending, this
 * browser's own page draws the code step in its place (sportbet's
 * modals/main), so a repeated request posts the same form from there.
 */
const addressFormPage = () => visitor('198.51.100.1').get('/');

async function askForCode(browser: Browser, email: string): Promise<Page> {
  return browser.submit(await addressFormPage(), 'sign-in-request', { email });
}

async function signedIn(): Promise<Browser> {
  const browser = visitor();
  const step = await askForCode(browser, JONAS_EMAIL);
  const [code] = await waitForCodes(mailpitUrl, JONAS_EMAIL);
  if (code === undefined) throw new Error('no code');
  await browser.submit(step, 'sign-in-verify', { code });
  return browser;
}

// A code still on its way must not land in the next test (settleMail).
afterEach(async () => {
  await settleMail(mailpitUrl);
});

beforeEach(async () => {
  await clearMail(mailpitUrl);
  await saveAccounts(db, [JONAS_ACCOUNT]);
});

describe('the throttles (AppServiceProvider)', () => {
  it('a code request: the fourth for one address in ten minutes is refused, and mints nothing', async () => {
    const browser = visitor();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(dialogText(await askForCode(browser, JONAS_EMAIL))).not.toContain(
        THROTTLED,
      );
    }
    await waitForCodes(mailpitUrl, JONAS_EMAIL, 3);
    expect(dialogText(await askForCode(browser, JONAS_EMAIL))).toContain(
      THROTTLED,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await codesTo(mailpitUrl, JONAS_EMAIL)).toHaveLength(3);
    expect(await rowsIn('login_codes')).toBe(3);
  });

  it('a code request: the eleventh from one IP in ten minutes is refused, across addresses', async () => {
    const browser = visitor('198.51.100.20');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(
        dialogText(
          await askForCode(browser, `guest${String(attempt)}@example.lt`),
        ),
      ).not.toContain(THROTTLED);
    }
    // The IP's window and one per address.
    expect(await rowsIn('rate_limits')).toBe(11);
    expect(
      dialogText(await askForCode(browser, 'overflow@example.lt')),
    ).toContain(THROTTLED);
    // Review W4: refused by the IP, it counted on no address.
    expect(await rowsIn('rate_limits')).toBe(11);
  });

  it('a blank address counts on its own IP key: another IP is answered by validation, not the throttle', async () => {
    const first = visitor('198.51.100.30');
    for (let attempt = 0; attempt < 3; attempt += 1)
      await askForCode(first, '');
    expect(dialogText(await askForCode(first, ''))).toContain(THROTTLED);
    const second = dialogText(await askForCode(visitor('198.51.100.31'), ''));
    expect(second).not.toContain(THROTTLED);
    expect(second).toContain('Įveskite el. pašto adresą.');
  });

  it('a verify: the sixth for one pending address in ten minutes is refused, on the code', async () => {
    const browser = visitor('198.51.100.40');
    const step = await askForCode(browser, JONAS_EMAIL);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        dialogText(await browser.submit(step, 'sign-in-verify', { code: 'x' })),
      ).toContain('Neteisingas arba pasibaigęs kodas.');
    }
    expect(
      dialogText(await browser.submit(step, 'sign-in-verify', { code: 'x' })),
    ).toContain(THROTTLED);
  });

  it('a verify: the sixteenth from one IP in ten minutes is refused, across addresses', async () => {
    const ip = '198.51.100.50';
    for (const address of ['a@example.lt', 'b@example.lt', 'c@example.lt']) {
      const browser = visitor(ip);
      const step = await askForCode(browser, address);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await browser.submit(step, 'sign-in-verify', { code: 'x' });
      }
    }
    const fourth = visitor(ip);
    const step = await askForCode(fourth, 'd@example.lt');
    expect(
      dialogText(await fourth.submit(step, 'sign-in-verify', { code: 'x' })),
    ).toContain(THROTTLED);
  });
});

// #16: every state-changing request refuses another origin, and changes nothing.
describe('cross-origin requests', () => {
  it.each(['sign-in-request', 'sign-in-verify', 'sign-in-cancel'])(
    'the %s form posted from another site is refused and changes nothing',
    async (testId) => {
      const browser = visitor('198.51.100.60');
      const step = await askForCode(browser, JONAS_EMAIL);
      const pending = browser.cookie(PENDING);
      await waitForCodes(mailpitUrl, JONAS_EMAIL);
      const form =
        testId === 'sign-in-request' ? await addressFormPage() : step;
      const fields: Record<string, string> =
        testId === 'sign-in-request'
          ? { email: JONAS_EMAIL }
          : testId === 'sign-in-verify'
            ? { code: '12345678' }
            : {};
      const refused = await browser.submit(form, testId, fields, {
        origin: EVIL,
      });
      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(setCookieFor(refused, PENDING)).toBeUndefined();
      expect(setCookieFor(refused, SESSION)).toBeUndefined();
      expect(browser.cookie(PENDING)).toBe(pending);
      expect(await rowsIn('login_codes')).toBe(1);
      expect(await rowsIn('sessions')).toBe(0);
    },
  );

  it('a request with no Origin is refused unless Sec-Fetch-Site says it is this site', async () => {
    const browser = visitor('198.51.100.61');
    const home = await browser.get('/');
    for (const from of [
      { origin: null },
      { origin: null, secFetchSite: 'cross-site' },
    ]) {
      const refused = await browser.submit(
        home,
        'sign-in-request',
        { email: JONAS_EMAIL },
        from,
      );
      expect(refused.status).toBeGreaterThanOrEqual(400);
    }
    expect(browser.cookie(PENDING)).toBeUndefined();
  });

  it('sign-out from another site is refused, and the player stays signed in', async () => {
    const browser = await signedIn();
    const refused = await browser.post('/logout', undefined, { origin: EVIL });
    expect(refused.status).toBe(403);
    expect(await rowsIn('sessions')).toBe(1);
  });
});

describe('/logout', () => {
  it('refuses a GET (405) and signs no one out', async () => {
    const browser = await signedIn();
    expect((await browser.get('/logout')).status).toBe(405);
    expect(await rowsIn('sessions')).toBe(1);
  });

  it('a POST ends the session, clears the cookie and goes back to /', async () => {
    const browser = await signedIn();
    const out = await browser.post('/logout');
    expect(out.status).toBe(302);
    expect(out.location).toBe('/');
    expect(setCookieFor(out, SESSION)).toMatch(
      /Max-Age=0.*Secure|Secure.*Max-Age=0/,
    );
    expect(await rowsIn('sessions')).toBe(0);
    const home = documentOf(await browser.get('/'));
    expect(home.querySelector('[data-testid="sign-in-dialog"]')).not.toBeNull();
  });
});

it("a signed-in visitor's code request goes to / and mints nothing (sportbet's guest middleware)", async () => {
  const guest = visitor('198.51.100.70');
  const home = await guest.get('/');
  const browser = await signedIn();
  await clearMail(mailpitUrl);
  const answer = await browser.submit(home, 'sign-in-request', {
    email: JONAS_EMAIL,
  });
  expect(answer.status).toBe(303);
  expect(answer.location).toBe('/');
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(await codesTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
});
