import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { now } from '../../src/server/clock';
import { sealFlash } from '../../src/server/flash';
import { TEST_AUTH_SECRET as SECRET } from '../support/app';
import { Browser, documentOf, setCookieFor } from '../support/browser';

// sportbet's ->with('info' | 'error', ...) shown once: proxy.ts hands the
// sealed __Host-sb_flash to the page's render as x-sportbet-flash and
// clears it on that page's response.

const baseUrl = inject('baseUrl');
useTestDatabase();

const FLASH = '__Host-sb_flash';

const alertOn = (html: string) =>
  documentOf({
    path: '/',
    status: 200,
    location: null,
    html,
    setCookies: [],
  }).querySelector('[role="alert"], [role="status"]')?.textContent ?? null;

describe('a one-time message', () => {
  it('shows on the next page once, and is cleared by that page', async () => {
    const browser = new Browser(baseUrl, '192.0.2.50');
    browser.setCookie(
      FLASH,
      sealFlash({ kind: 'registration-closed' }, now(), SECRET),
    );
    const first = await browser.get('/');
    expect(alertOn(first.html)).toBe(
      'Registracija į šį turnyrą jau pasibaigė.',
    );
    expect(setCookieFor(first, FLASH)).toMatch(/Max-Age=0/);
    expect(setCookieFor(first, FLASH)).toMatch(/Secure/);
    expect(alertOn((await browser.get('/')).html)).toBeNull();
  });

  it("shows nothing for a client that sends the proxy's header itself, even sealed", async () => {
    const page = await fetch(new URL('/', baseUrl), {
      headers: {
        'x-sportbet-flash': sealFlash(
          { kind: 'registered', tournament: 'Euroleague 2027/28' },
          now(),
          SECRET,
        ),
      },
    });
    expect(alertOn(await page.text())).toBeNull();
  });

  it('shows nothing for a value the server did not seal', async () => {
    const browser = new Browser(baseUrl, '192.0.2.51');
    browser.setCookie(
      FLASH,
      sealFlash({ kind: 'registration-closed' }, now(), `${SECRET}-forged`),
    );
    expect(alertOn((await browser.get('/')).html)).toBeNull();
  });
});

// Security review L3: a cookie the client wrote itself never reaches a
// request header as anything but the shape the server writes; one that
// decodes to a line break must not break the page.
describe('what proxy.ts forwards', () => {
  const dialogOpen = (html: string) =>
    documentOf({ path: '/', status: 200, location: null, html, setCookies: [] })
      .querySelector('[data-testid="sign-in-dialog"]')
      ?.hasAttribute('hidden') === false;

  it('a flash cookie that decodes to a line break is dropped and cleared, and the page still answers', async () => {
    const browser = new Browser(baseUrl, '192.0.2.52');
    browser.setCookie(FLASH, 'a%0D%0Ab.c');
    const page = await browser.get('/');
    expect(page.status).toBe(200);
    expect(alertOn(page.html)).toBeNull();
    expect(setCookieFor(page, FLASH)).toMatch(/Max-Age=0/);
  });

  it('a flash cookie not shaped as a sealed value is dropped and cleared', async () => {
    const browser = new Browser(baseUrl, '192.0.2.53');
    browser.setCookie(FLASH, 'a.b.c');
    const page = await browser.get('/');
    expect(page.status).toBe(200);
    expect(setCookieFor(page, FLASH)).toMatch(/Max-Age=0/);
  });

  it('a dialog cookie that decodes to a line break, or names no tab, opens nothing and the page still answers', async () => {
    for (const value of ['login%0D%0Ax', 'other']) {
      const browser = new Browser(baseUrl, '192.0.2.54');
      browser.setCookie('__Host-sb_signin_open', value);
      const page = await browser.get('/');
      expect(page.status).toBe(200);
      expect(dialogOpen(page.html)).toBe(false);
    }
  });
});

// Security review, Task 15: a prefetch must not take the message meant
// for the page the player is sent to. A browser's speculative load says so
// (Sec-Purpose); Next's router prefetch is not seen by proxy.ts (its
// adapter strips the header), and cannot come between the 303 that sets a
// message and the page load that follows it.
it('a prefetch leaves the message for the page actually opened', async () => {
  const sealed = sealFlash(
    { kind: 'registered', tournament: 'Euroleague 2027/28' },
    now(),
    SECRET,
  );
  const prefetch = await fetch(new URL('/', baseUrl), {
    headers: {
      cookie: `${FLASH}=${sealed}`,
      'sec-purpose': 'prefetch',
    },
  });
  expect(
    prefetch.headers
      .getSetCookie()
      .some((line) => line.startsWith(`${FLASH}=`)),
  ).toBe(false);
  const browser = new Browser(baseUrl, '192.0.2.55');
  browser.setCookie(FLASH, sealed);
  expect(alertOn((await browser.get('/')).html)).toBe(
    'Užsiregistravote į turnyrą: Euroleague 2027/28',
  );
});
