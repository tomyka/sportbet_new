import { expect, test } from '@playwright/test';
import {
  answerCookies,
  newcomer,
  register,
  scrollsSideways,
} from './support/newcomer';

// Registration (spec 4c, issue #18): the Registruotis tab, four answers,
// the code from Mailpit, signed in and in the tournament taking players.
// Only CI's stack has Mailpit, so playwright.config.ts leaves this file out
// against staging. The stack's database lives for the whole run: each test
// registers an address and a username no other test uses.

test.describe.configure({ mode: 'serial' });

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
