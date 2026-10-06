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
