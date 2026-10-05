import { issueLoginCode } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { now } from '../../src/server/clock';
import { hashSessionToken } from '../../src/server/session/session-token';
import { hashLoginCode } from '../../src/server/sign-in/code-hash';
import {
  JONAS_ACCOUNT,
  JONAS_EMAIL,
  saveAccounts,
  ZUKAUSKAS_ACCOUNT,
  ZUKAUSKAS_EMAIL,
} from '../support/accounts';
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

// sportbet's EmailCodeLoginTest, LoginCodeStepTest, SignInDialogTest,
// AuditLoginTest and SessionCookieSecurityTest, against the built app.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const { db, client } = useTestDatabase();

const SESSION = '__Host-sb_session';
const PENDING = '__Host-sb_signin';
const OPEN = '__Host-sb_signin_open';

const visitor = (ip = '203.0.113.10') => new Browser(baseUrl, ip);

const rowsIn = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as rows from ${table}`)).rows,
    )[0]?.rows;

const dialogText = (page: Page) =>
  documentOf(page).querySelector('[role="dialog"]')?.textContent ?? '';

async function askForCode(browser: Browser, email: string): Promise<Page> {
  return browser.submit(await browser.get('/'), 'sign-in-request', { email });
}

async function onlyCode(email: string): Promise<string> {
  const [code] = await waitForCodes(mailpitUrl, email);
  if (code === undefined) throw new Error('no code');
  return code;
}

// A code still on its way must not land in the next test (settleMail).
afterEach(async () => {
  await settleMail(mailpitUrl);
});

beforeEach(async () => {
  await clearMail(mailpitUrl);
  await saveAccounts(db, [JONAS_ACCOUNT, ZUKAUSKAS_ACCOUNT]);
});

describe('the dialog and /login (SignInDialogTest)', () => {
  it('a guest page carries the dialog, closed, with its address form, and "Prisijungti" leading to /login', async () => {
    const home = await visitor().get('/');
    const page = documentOf(home);
    expect(
      page
        .querySelector('[data-testid="sign-in-dialog"]')
        ?.hasAttribute('hidden'),
    ).toBe(true);
    expect(
      page.querySelector('form[data-testid="sign-in-request"]'),
    ).not.toBeNull();
    expect(
      page.querySelectorAll('a[href="/login"]').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('/login renders nothing: it sends a guest to / with the dialog to open there', async () => {
    const browser = visitor();
    const login = await browser.get('/login');
    expect(login.status).toBe(302);
    expect(login.location).toBe('/');
    expect(setCookieFor(login, OPEN)).toMatch(/Max-Age=60/);
    expect(setCookieFor(login, OPEN)).toMatch(/HttpOnly/);
    const arrival = await browser.get('/');
    const home = documentOf(arrival);
    expect(
      home
        .querySelector('[data-testid="sign-in-dialog"]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    // It has done its job: the page that opened the dialog clears it, so
    // the next page opens nothing.
    expect(setCookieFor(arrival, OPEN)).toMatch(/Max-Age=0/);
    const next = documentOf(await browser.get('/'));
    expect(
      next
        .querySelector('[data-testid="sign-in-dialog"]')
        ?.hasAttribute('hidden'),
    ).toBe(true);
  });

  it("opens nothing for a client that sends the proxy's header itself", async () => {
    const page = await fetch(new URL('/', baseUrl), {
      headers: { 'x-sportbet-open-sign-in': '1' },
    });
    const home = documentOf({
      path: '/',
      status: page.status,
      location: null,
      html: await page.text(),
      setCookies: [],
    });
    expect(
      home
        .querySelector('[data-testid="sign-in-dialog"]')
        ?.hasAttribute('hidden'),
    ).toBe(true);
  });

  // #16's note: the slug is registration's (intended_tournament), never the sign-in's.
  it('/login?tournament= opens the dialog, keeps the slug for registration, and carries nothing into the sign-in', async () => {
    const browser = visitor();
    const login = await browser.get('/login?tournament=euroleague-2026-27');
    expect(login.location).toBe('/');
    expect(browser.cookie('__Host-sb_intended')).toBe('euroleague-2026-27');
    const home = documentOf(await browser.get('/'));
    expect(
      home
        .querySelector('[data-testid="sign-in-dialog"]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    expect(home.querySelector('input[name="next"]')).toBeNull();
    const step = await browser.submit(
      await browser.get('/'),
      'sign-in-request',
      { email: JONAS_EMAIL },
    );
    const [body = ''] = (browser.cookie(PENDING) ?? '').split('.');
    expect(Buffer.from(body, 'base64url').toString('utf8')).not.toContain(
      'euroleague',
    );
    expect(step.status).toBe(200);
  });
});

describe('asking for a code (EmailCodeLoginController::request)', () => {
  it('shows the code step for the address, mails the account one code, and stores only its hash', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    expect(step.status).toBe(200);
    expect(dialogText(step)).toContain(`Kodą išsiuntėme į ${JONAS_EMAIL}`);
    expect(dialogText(step)).toMatch(/Kodas galioja dar [45]:\d\d/);
    expect(browser.cookie(PENDING)).toBeDefined();
    const code = await onlyCode(JONAS_EMAIL);
    expect(code).toMatch(/^\d{8}$/);
    const stored = await client.query(
      'select email, code_hash from login_codes',
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({ email: JONAS_EMAIL });
    expect(JSON.stringify(stored.rows)).not.toContain(code);
  });

  it('answers an address with no account exactly as one with: the same step, the same cookie, and no mail or code (#36)', async () => {
    const known = visitor();
    const unknown = visitor('203.0.113.11');
    const a = await askForCode(known, JONAS_EMAIL);
    const b = await askForCode(unknown, 'nobody@example.lt');
    expect(b.status).toBe(a.status);
    // The same words but the address, and a countdown a second apart at most.
    const words = (page: Page, email: string) =>
      dialogText(page)
        .replace(email, 'X')
        .replace(/\d:\d\d/g, 'm:ss');
    expect(words(b, 'nobody@example.lt')).toBe(words(a, JONAS_EMAIL));
    expect(unknown.cookie(PENDING)).toBeDefined();
    await onlyCode(JONAS_EMAIL);
    expect(await codesTo(mailpitUrl, 'nobody@example.lt')).toEqual([]);
    expect(await rowsIn('login_codes')).toBe(1);
  });

  it('finds the account whatever the case and the spaces typed', async () => {
    const browser = visitor();
    const step = await askForCode(browser, '  Jonas.Petraitis@Example.LT ');
    expect(dialogText(step)).toContain(JONAS_EMAIL);
    const code = await onlyCode(JONAS_EMAIL);
    expect(
      (await browser.submit(step, 'sign-in-verify', { code })).status,
    ).toBe(303);
  });

  it('Q2: answers a blank address and one that is not an address in Lithuanian', async () => {
    const browser = visitor();
    const blank = await askForCode(browser, '');
    expect(dialogText(blank)).toContain('Įveskite el. pašto adresą.');
    const bad = await askForCode(browser, 'jonas');
    expect(dialogText(bad)).toContain('Įveskite teisingą el. pašto adresą.');
    expect(browser.cookie(PENDING)).toBeUndefined();
  });

  it('acknowledges a resend, and the new code supersedes the old one', async () => {
    const browser = visitor();
    const first = await askForCode(browser, JONAS_EMAIL);
    await onlyCode(JONAS_EMAIL);
    const second = await browser.submit(first, 'sign-in-resend');
    expect(dialogText(second)).toContain('Kodą išsiuntėme iš naujo.');
    const [old, current] = await waitForCodes(mailpitUrl, JONAS_EMAIL, 2);
    if (old === undefined || current === undefined)
      throw new Error('two codes');
    expect(
      dialogText(await browser.submit(second, 'sign-in-verify', { code: old })),
    ).toContain('Neteisingas arba pasibaigęs kodas.');
    expect(
      (await browser.submit(second, 'sign-in-verify', { code: current }))
        .status,
    ).toBe(303);
  });

  it('"Atgal" drops the step: the pending cookie goes and the address form is back', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    const back = await browser.submit(step, 'sign-in-cancel');
    expect(browser.cookie(PENDING)).toBeUndefined();
    expect(
      documentOf(back).querySelector('form[data-testid="sign-in-request"]'),
    ).not.toBeNull();
    expect(
      documentOf(back).querySelector('form[data-testid="sign-in-verify"]'),
    ).toBeNull();
  });
});

describe('typing the code (EmailCodeLoginController::verify)', () => {
  it('a right code signs the player in: the session cookie with its flags, back to /, the step gone, an email_code record', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    const signedIn = await browser.submit(step, 'sign-in-verify', {
      code: await onlyCode(JONAS_EMAIL),
    });
    // Next answers a Server Action's redirect() with 303 See Other.
    expect(signedIn.status).toBe(303);
    expect(signedIn.location).toBe('/');
    const cookie = setCookieFor(signedIn, SESSION) ?? '';
    expect(cookie).toMatch(
      /^__Host-sb_session=[A-Za-z0-9_-]{43}\.\d{4}-\d{2}-\d{2};/,
    );
    for (const flag of [
      /; Path=\//,
      /; Max-Age=7776000/,
      /; Secure/,
      /; HttpOnly/,
      /; SameSite=lax/i,
    ]) {
      expect(cookie).toMatch(flag);
    }
    expect(setCookieFor(signedIn, PENDING)).toMatch(/Max-Age=0/);
    const token = (browser.cookie(SESSION) ?? '').split('.')[0] ?? '';
    const sessions = await client.query('select token_hash from sessions');
    expect(sessions.rows).toEqual([{ token_hash: hashSessionToken(token) }]);
    const audit = await client.query(
      'select player_id, method from audit_logins',
    );
    expect(audit.rows).toEqual([{ player_id: 1, method: 'email_code' }]);
    const home = await browser.get('/');
    expect(
      documentOf(home).querySelector('[data-testid="rail"]')?.textContent,
    ).toContain('Jonas P.');
    expect(
      documentOf(home).querySelector('[data-testid="sign-in-dialog"]'),
    ).toBeNull();
  });

  it('goes home after sign-in, whatever /login?tournament= said (review W5)', async () => {
    const browser = visitor();
    await browser.get('/login?tournament=euroleague-2026-27');
    const step = await askForCode(browser, JONAS_EMAIL);
    const signedIn = await browser.submit(step, 'sign-in-verify', {
      code: await onlyCode(JONAS_EMAIL),
    });
    expect(signedIn.location).toBe('/');
  });

  it('refuses a wrong code with the one answer, and still takes the right one after', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    const code = await onlyCode(JONAS_EMAIL);
    const wrong = code === '00000000' ? '11111111' : '00000000';
    const refused = await browser.submit(step, 'sign-in-verify', {
      code: wrong,
    });
    expect(refused.status).toBe(200);
    expect(dialogText(refused)).toContain('Neteisingas arba pasibaigęs kodas.');
    expect(browser.cookie(SESSION)).toBeUndefined();
    expect(
      (await browser.submit(step, 'sign-in-verify', { code })).status,
    ).toBe(303);
  });

  it('refuses an expired code with the same answer', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    const code = await onlyCode(JONAS_EMAIL);
    await client.query(
      "update login_codes set expires_at = now() - interval '1 second'",
    );
    expect(
      dialogText(await browser.submit(step, 'sign-in-verify', { code })),
    ).toContain('Neteisingas arba pasibaigęs kodas.');
  });

  // Review W6: a code is for one purpose; another's never signs anyone in.
  it("refuses a live code of another purpose for the account's address with the one answer", async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    await onlyCode(JONAS_EMAIL);
    const registration = '24681357';
    await issueLoginCode(db, {
      email: unwrap(emailAddress(JONAS_EMAIL)),
      purpose: 'registration',
      codeHash: await hashLoginCode(registration),
      now: now(),
    });
    const refused = await browser.submit(step, 'sign-in-verify', {
      code: registration,
    });
    expect(dialogText(refused)).toContain('Neteisingas arba pasibaigęs kodas.');
    expect(browser.cookie(SESSION)).toBeUndefined();
    expect(await rowsIn('sessions')).toBe(0);
  });

  it('refuses a code used once already', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    const pending = browser.cookie(PENDING) ?? '';
    const code = await onlyCode(JONAS_EMAIL);
    expect(
      (await browser.submit(step, 'sign-in-verify', { code })).status,
    ).toBe(303);
    const again = visitor('203.0.113.12');
    again.setCookie(PENDING, pending);
    expect(
      dialogText(await again.submit(step, 'sign-in-verify', { code })),
    ).toContain('Neteisingas arba pasibaigęs kodas.');
    expect(await rowsIn('sessions')).toBe(1);
  });

  it("#41: the ASCII spelling of an accented address gets no code, and cannot claim the accented one's", async () => {
    const ascii = visitor();
    const accented = visitor('203.0.113.13');
    const asciiStep = await askForCode(ascii, 'zukauskas@example.lt');
    const accentedStep = await askForCode(accented, ZUKAUSKAS_EMAIL);
    const code = await onlyCode(ZUKAUSKAS_EMAIL);
    expect(await codesTo(mailpitUrl, 'zukauskas@example.lt')).toEqual([]);
    expect(await rowsIn('login_codes')).toBe(1);
    expect(
      dialogText(await ascii.submit(asciiStep, 'sign-in-verify', { code })),
    ).toContain('Neteisingas arba pasibaigęs kodas.');
    expect(
      (await accented.submit(accentedStep, 'sign-in-verify', { code })).status,
    ).toBe(303);
  });

  it('asks for the address first when no code was asked for in this browser', async () => {
    const step = await askForCode(visitor(), JONAS_EMAIL);
    const stranger = visitor('203.0.113.14');
    expect(
      dialogText(
        await stranger.submit(step, 'sign-in-verify', { code: '12345678' }),
      ),
    ).toContain('Pirmiausia įveskite el. pašto adresą.');
  });

  it('Q2: answers a blank code in Lithuanian', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    expect(
      dialogText(await browser.submit(step, 'sign-in-verify', { code: '' })),
    ).toContain('Įveskite kodą.');
  });

  it('sends a signed-in visitor at /login to / without opening anything', async () => {
    const browser = visitor();
    const step = await askForCode(browser, JONAS_EMAIL);
    await browser.submit(step, 'sign-in-verify', {
      code: await onlyCode(JONAS_EMAIL),
    });
    const login = await browser.get('/login');
    expect(login.location).toBe('/');
    expect(setCookieFor(login, OPEN)).toBeUndefined();
  });
});
