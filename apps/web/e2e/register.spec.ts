import { expect, test, type Page } from '@playwright/test';
import { codesTo, waitForCodes } from '../tests/support/mailpit';

// Registration (spec 4c, issue #18): the Registruotis tab, four answers,
// the code from Mailpit, signed in and in the tournament taking players.
// Only CI's stack has Mailpit, so playwright.config.ts leaves this file out
// against staging. The stack's database lives for the whole run: each test
// registers an address and a username no other test uses.

const MAILPIT = process.env['E2E_MAILPIT_URL'] ?? '';

test.describe.configure({ mode: 'serial' });

/** The cookie bar sits over the page's foot; the visitor answers it first. */
async function answerCookies(page: Page): Promise<void> {
  await page
    .getByTestId('cookie-consent')
    .getByRole('button', { name: 'Tik būtini' })
    .click();
}

interface Newcomer {
  readonly username: string;
  readonly name: string;
  readonly surname: string;
  readonly email: string;
}

/** A newcomer of this run, at this width. */
function newcomer(width: number): Newcomer {
  const tag = `${String(width)}x${String(Date.now())}`;
  return {
    username: `naujoke${tag}`,
    name: 'Rūta',
    surname: 'Naujokė',
    email: `e2e.naujoke.${tag}@sportbet.test`,
  };
}

/** From an open dialog to a signed-in page: the Registruotis tab, the answers, the mailed code. */
async function register(page: Page, who: Newcomer): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Prisijungti' });
  await expect(dialog).toBeVisible();
  const tab = dialog.getByRole('tab', { name: 'Registruotis' });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const form = dialog.getByTestId('register-request');
  await form
    .getByPlaceholder('Slapyvardis', { exact: true })
    .fill(who.username);
  await form.getByPlaceholder('Vardas', { exact: true }).fill(who.name);
  await form.getByPlaceholder('Pavardė', { exact: true }).fill(who.surname);
  await form.getByPlaceholder('El. paštas', { exact: true }).fill(who.email);
  const before = (await codesTo(MAILPIT, who.email)).length;
  await form.getByRole('button', { name: 'Registruotis' }).click();
  await expect(dialog.getByText(who.email)).toBeVisible();
  const code = (await waitForCodes(MAILPIT, who.email, before + 1)).at(-1);
  if (code === undefined) throw new Error('no code was mailed');
  await dialog.getByLabel('8 skaitmenų kodas').fill(code);
  await dialog.getByRole('button', { name: 'Užbaigti registraciją' }).click();
  await expect(dialog).toBeHidden();
}

/** sportbet's LayoutOverflowRegressionTest, in a browser: the page never scrolls sideways. */
async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

test.describe('at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('registers from the phone bar with a mailed code and lands signed in, in the open tournament', async ({
    page,
  }) => {
    await page.goto('/');
    await answerCookies(page);
    const bar = page.getByTestId('phone-header');
    await bar.getByRole('link', { name: 'Prisijungti' }).click();
    expect(await scrollsSideways(page)).toBe(false);
    await register(page, newcomer(390));
    await bar.getByRole('button', { name: 'Atidaryti meniu' }).click();
    await expect(bar.getByText('Euroleague 2026/27')).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
  });
});

test.describe('at a desktop width', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('/register opens the dialog on Registruotis; registering lands signed in, in the open tournament', async ({
    page,
  }) => {
    // The cookie bar is answered first: the dialog /register opens covers it.
    await page.goto('/');
    await answerCookies(page);
    await page.goto('/register');
    await expect(page).toHaveURL('/');
    await expect(
      page
        .getByRole('dialog', { name: 'Prisijungti' })
        .getByRole('tab', { name: 'Registruotis' }),
    ).toHaveAttribute('aria-selected', 'true');
    await register(page, newcomer(1280));
    const rail = page.getByTestId('rail');
    await expect(rail.getByText('Rūta N.')).toBeVisible();
    await expect(
      page.getByTestId('rail-context').getByText('Euroleague 2026/27'),
    ).toBeVisible();
    // Still signed in after a fresh load: registering signs in like a code does.
    await page.reload();
    await expect(rail.getByText('Rūta N.')).toBeVisible();
  });
});
