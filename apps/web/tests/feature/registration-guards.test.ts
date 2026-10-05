import { advanceIdentitySequences } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { JONAS_ACCOUNT, saveAccounts } from '../support/accounts';
import {
  Browser,
  documentOf,
  setCookieFor,
  type Page,
} from '../support/browser';
import { clearMail, settleMail, waitForCodes } from '../support/mailpit';
import { ANSWERS, startRegistration } from '../support/registration';

// sportbet's RegistrationRateLimitTest and the 'register',
// 'register-page' and 'register-confirm' limiters (3eb95e7), and #16's
// cross-origin refusals.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const { db, client } = useTestDatabase();

const PENDING = '__Host-sb_register';
const EVIL = 'https://evil.example';
const WRONG = 'Neteisingas arba pasibaigęs kodas.';
const TEN_MINUTES = 'Per daug bandymų. Pabandykite dar kartą po 10 min.';
const ONE_MINUTE = 'Per daug bandymų. Pabandykite dar kartą po 1 min.';

const visitor = (ip: string) => new Browser(baseUrl, ip);
const dialogText = (page: Page) =>
  documentOf(page).querySelector('[role="dialog"]')?.textContent ?? '';
const rowsIn = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as rows from ${table}`)).rows,
    )[0]?.rows;

afterEach(async () => {
  await settleMail(mailpitUrl);
});

beforeEach(async () => {
  await clearMail(mailpitUrl);
  await saveAccounts(db, [JONAS_ACCOUNT]);
  await advanceIdentitySequences(db);
});

describe("the registration throttles (AppServiceProvider, bootstrap/app.php's answer)", () => {
  it('throttle: step one - the fourth for one address in ten minutes is refused, whatever its spelling, and mails nothing', async () => {
    const spellings = [
      ANSWERS.email,
      'Ruta.Naujoke@Example.LT',
      '  RUTA.NAUJOKE@EXAMPLE.LT  ',
    ];
    for (const [index, email] of spellings.entries()) {
      const page = await startRegistration(
        visitor(`192.0.2.${String(20 + index)}`),
        { email },
      );
      expect(dialogText(page)).not.toContain('Per daug bandymų');
    }
    await waitForCodes(mailpitUrl, ANSWERS.email, 3);
    const refused = await startRegistration(visitor('192.0.2.29'));
    expect(dialogText(refused)).toContain(TEN_MINUTES);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await rowsIn('login_codes')).toBe(3);
  });

  // #18 review W1: register-code-step shows $errors->first().
  it('throttle: a resend over the address limit says so on the code step, and mails nothing', async () => {
    const browser = visitor('192.0.2.90');
    const step = await startRegistration(browser);
    for (const ip of ['192.0.2.91', '192.0.2.92']) {
      await startRegistration(visitor(ip));
    }
    await waitForCodes(mailpitUrl, ANSWERS.email, 3);
    const refused = await browser.submit(step, 'register-resend');
    expect(dialogText(refused)).toContain(TEN_MINUTES);
    expect(
      documentOf(refused).querySelector('form[data-testid="register-confirm"]'),
    ).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await rowsIn('login_codes')).toBe(3);
  });

  it('throttle: step one - the fourth from one IP in a minute is refused, across addresses', async () => {
    const browser = visitor('192.0.2.30');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const fresh = visitor('192.0.2.30');
      const page = await startRegistration(fresh, {
        username: `naujas${String(attempt)}`,
        email: `naujas${String(attempt)}@example.lt`,
      });
      expect(dialogText(page)).not.toContain('Per daug bandymų');
    }
    const refused = await startRegistration(browser, {
      username: 'naujas9',
      email: 'naujas9@example.lt',
    });
    expect(dialogText(refused)).toContain(ONE_MINUTE);
    await settleMail(mailpitUrl);
    expect(await rowsIn('login_codes')).toBe(3);
  });

  it('throttle: a blank address counts on its own IP key - another IP is answered by the form, not the throttle', async () => {
    const first = visitor('192.0.2.40');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await startRegistration(first, { email: '' });
    }
    expect(dialogText(await startRegistration(first, { email: '' }))).toContain(
      ONE_MINUTE,
    );
    const second = dialogText(
      await startRegistration(visitor('192.0.2.41'), { email: '' }),
    );
    expect(second).not.toContain('Per daug bandymų');
    expect(second).toContain('Įveskite el. pašto adresą.');
  });

  it('throttle: /register - the eleventh from one IP in a minute is refused (Q3)', async () => {
    const browser = visitor('192.0.2.50');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await browser.get('/register')).status).toBe(302);
    }
    const refused = await browser.get('/register');
    expect(refused.status).toBe(429);
    expect(refused.html).toBe(ONE_MINUTE);
  });

  it('throttle: step two - the sixth for one pending address in ten minutes is refused, on the code', async () => {
    const browser = visitor('192.0.2.60');
    const step = await startRegistration(browser);
    await waitForCodes(mailpitUrl, ANSWERS.email);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        dialogText(
          await browser.submit(step, 'register-confirm', { code: '00000000' }),
        ),
      ).toContain(WRONG);
    }
    const refused = await browser.submit(step, 'register-confirm', {
      code: '00000000',
    });
    expect(dialogText(refused)).toContain(TEN_MINUTES);
    expect(await rowsIn('players')).toBe(1);
  });

  it('throttle: step two - the sixteenth from one IP in ten minutes is refused, across pending addresses', async () => {
    const steps: { browser: Browser; step: Page }[] = [];
    for (const name of ['pirmas', 'antras', 'trecias']) {
      const browser = visitor('192.0.2.70');
      steps.push({
        browser,
        step: await startRegistration(browser, {
          username: name,
          email: `${name}@example.lt`,
        }),
      });
    }
    await settleMail(mailpitUrl);
    for (const { browser, step } of steps) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(
          dialogText(
            await browser.submit(step, 'register-confirm', {
              code: '00000000',
            }),
          ),
        ).toContain(WRONG);
      }
    }
    const [first] = steps;
    if (first === undefined) throw new Error('no step');
    // A fourth browser on the IP, with nothing pending: refused by the IP.
    const refused = await visitor('192.0.2.70').submit(
      first.step,
      'register-confirm',
      { code: '00000000' },
    );
    expect(dialogText(refused)).toContain(TEN_MINUTES);
  });
});

// #16: every state-changing request refuses another origin, and changes nothing.
describe('cross-origin registration requests', () => {
  it.each([
    [
      'register-request',
      { ...ANSWERS, username: 'kitas', email: 'kitas@example.lt' },
    ],
    ['register-confirm', { code: '12345678' }],
    ['register-cancel', {}],
  ] as const)(
    'the %s form posted from another site is refused and changes nothing',
    async (testId, fields) => {
      const browser = visitor('192.0.2.80');
      const step = await startRegistration(browser);
      await waitForCodes(mailpitUrl, ANSWERS.email);
      const pending = browser.cookie(PENDING);
      const page =
        testId === 'register-request'
          ? await visitor('192.0.2.81').get('/')
          : step;
      const refused = await browser.submit(page, testId, fields, {
        origin: EVIL,
      });
      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(setCookieFor(refused, PENDING)).toBeUndefined();
      expect(browser.cookie(PENDING)).toBe(pending);
      expect(await rowsIn('login_codes')).toBe(1);
      expect(await rowsIn('players')).toBe(1);
    },
  );

  it('step one with no Origin is refused unless Sec-Fetch-Site says same-origin', async () => {
    const browser = visitor('192.0.2.82');
    const home = await browser.get('/');
    for (const from of [
      { origin: null },
      { origin: null, secFetchSite: 'cross-site' },
    ]) {
      const refused = await browser.submit(
        home,
        'register-request',
        ANSWERS,
        from,
      );
      expect(refused.status).toBeGreaterThanOrEqual(400);
    }
    expect(browser.cookie(PENDING)).toBeUndefined();
    expect(await rowsIn('login_codes')).toBe(0);
  });
});
