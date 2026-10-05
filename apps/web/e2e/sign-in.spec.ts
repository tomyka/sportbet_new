import { expect, test, type Page } from '@playwright/test';
import { clearMail, waitForCodes } from '../tests/support/mailpit';

// The sign-in journey (spec 4b, issue #16): "Prisijungti", an address, the
// code from Mailpit, the player shell, sign-out. The stack seeds one
// account at this address (infra/compose/e2e.yml); only CI's stack has
// Mailpit, so playwright.config.ts leaves this file out against staging.

const MAILPIT = process.env['E2E_MAILPIT_URL'] ?? '';
const PLAYER = 'e2e.player@sportbet.test';

// One account, one inbox: one journey at a time.
test.describe.configure({ mode: 'serial' });

/**
 * A first visit asks about cookies in a bar over the page's foot, where the
 * rail's "Prisijungti" sits at 1280 - sportbet's .sb-cookie-banner does the
 * same - so the visitor answers it first.
 */
async function answerCookies(page: Page): Promise<void> {
  await page
    .getByTestId('cookie-consent')
    .getByRole('button', { name: 'Tik būtini' })
    .click();
}

/** From an open dialog to a signed-in page: the address, the mailed code. */
async function signIn(page: Page): Promise<void> {
  await clearMail(MAILPIT);
  const dialog = page.getByRole('dialog', { name: 'Prisijungti' });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('El. paštas').fill(PLAYER);
  await dialog.getByRole('button', { name: 'Gauti prisijungimo kodą' }).click();
  await expect(dialog.getByText(PLAYER)).toBeVisible();
  const [code] = await waitForCodes(MAILPIT, PLAYER);
  if (code === undefined) throw new Error('no code was mailed');
  await dialog.getByLabel('8 skaitmenų kodas').fill(code);
  await dialog
    .getByRole('button', { name: 'Prisijungti', exact: true })
    .click();
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

  test('signs in with a mailed code from the phone bar, sees the player shell, and signs out', async ({
    page,
  }) => {
    await page.goto('/');
    await answerCookies(page);
    const bar = page.getByTestId('phone-header');
    await bar.getByRole('link', { name: 'Prisijungti' }).click();
    await signIn(page);
    await bar.getByRole('button', { name: 'Atidaryti meniu' }).click();
    await expect(bar.getByText('Euroleague 2026/27')).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
    await bar.getByRole('button', { name: 'Atsijungti' }).click();
    await expect(bar.getByRole('link', { name: 'Prisijungti' })).toBeVisible();
    // The session is gone, not just the page: a fresh load is a guest's.
    await page.reload();
    await expect(bar.getByRole('link', { name: 'Prisijungti' })).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
  });
});

test.describe('at a desktop width', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('signs in with a mailed code from the rail, sees the player shell, and signs out', async ({
    page,
  }) => {
    await page.goto('/');
    await answerCookies(page);
    const rail = page.getByTestId('rail');
    await rail.getByRole('link', { name: 'Prisijungti' }).click();
    await signIn(page);
    await expect(rail.getByText('Savininkas')).toBeVisible();
    await expect(
      page.getByTestId('rail-context').getByText('Euroleague 2026/27'),
    ).toBeVisible();
    // Still signed in after a fresh load: the session cookie carries it.
    await page.reload();
    await expect(rail.getByText('Savininkas')).toBeVisible();
    await rail.getByRole('button', { name: 'Atsijungti' }).click();
    await expect(rail.getByRole('link', { name: 'Prisijungti' })).toBeVisible();
    await page.reload();
    await expect(rail.getByRole('link', { name: 'Prisijungti' })).toBeVisible();
  });

  test('/login opens the dialog on the tournaments page, once', async ({
    page,
  }) => {
    await page.goto('/login?tournament=euroleague-2026-27');
    // A ?tournament= steers nothing: sportbet keeps it for registration (4c).
    await expect(page).toHaveURL('/');
    const dialog = page.getByRole('dialog', { name: 'Prisijungti' });
    await expect(dialog).toBeVisible();
    // The cookie that opened it is spent: the next page opens nothing.
    await page.reload();
    await expect(page.getByTestId('rail')).toBeVisible();
    await expect(dialog).toBeHidden();
  });
});
