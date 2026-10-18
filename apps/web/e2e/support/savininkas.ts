import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext } from '@playwright/test';
import { answerCookies, signIn } from './newcomer';

// The stack's one seeded account, a superadmin (R-26 amended), and its
// session shared between the specs that need it. An address is allowed three
// sign-in codes in ten minutes: sign-in.spec.ts uses two and
// predictions.spec.ts one, whose journey is the sign-in itself - so a spec
// that only needs the account signed in reuses the session
// predictions.spec.ts saved, and signs in only when run on its own.

export const SAVININKAS = {
  username: 'savininkas',
  name: 'Savininkas',
  surname: '',
  email: 'e2e.player@sportbet.test',
} as const;

/** Where predictions.spec.ts saves the seeded account's signed-in session (Playwright empties test-results at the start of a run). */
export const SAVININKAS_SESSION = join(
  process.cwd(),
  'test-results',
  'savininkas-session.json',
);

/**
 * A browser context signed in as the seeded account at `viewport`, from
 * `ip` (the stack has no proxy, so the header is the client's): the session
 * predictions.spec.ts saved, or - run on its own - a sign-in with a mailed
 * code.
 */
export async function savininkasContext(
  browser: Browser,
  viewport: { readonly width: number; readonly height: number },
  ip: string,
  deviceScaleFactor = 1,
): Promise<BrowserContext> {
  const shared = existsSync(SAVININKAS_SESSION);
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    extraHTTPHeaders: { 'x-forwarded-for': ip },
    ...(shared ? { storageState: SAVININKAS_SESSION } : {}),
  });
  if (!shared) {
    const page = await context.newPage();
    // The reminder mail's link, signed out, opens the dialog.
    await page.goto('/');
    await answerCookies(page);
    await page.goto('/prediction/game/9001');
    await signIn(page, SAVININKAS);
    await page.close();
  }
  return context;
}
