import { expect, test } from '@playwright/test';
import {
  answerCookies,
  newcomer,
  register,
  scrollsSideways,
  signIn,
} from './support/newcomer';

// Joining a further tournament from the hub (slice 5, #19): a newcomer of
// this run registers (and so plays Euroleague 2026/27, R-48), opens
// 2027/28's registration form, confirms, lands home in it; "Keisti
// turnyrą" and "Žaisti" switch between them. Only CI's stack has Mailpit,
// so playwright.config.ts leaves this file out against staging.
//
// One newcomer for the whole file, registered once: sportbet's limit of 3
// registrations a minute per IP (registerRequestLimits) holds for the
// whole run, and register.spec.ts registers two. So the tests run in
// order, the second signing in as the first one's newcomer.

test.describe.configure({ mode: 'serial' });

const FORM = '/tournament/euroleague-2027-28/register';
const CONFIRM = 'Patvirtinu, kad noriu dalyvauti šiame turnyre.';
const who = newcomer(390);

test.describe('at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the registration form reads at a phone width without scrolling sideways', async ({
    page,
  }) => {
    await page.goto('/');
    await answerCookies(page);
    await page
      .getByTestId('phone-header')
      .getByRole('link', { name: 'Prisijungti' })
      .click();
    await register(page, who);
    await page.goto(FORM);
    await expect(page.getByRole('checkbox', { name: CONFIRM })).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
  });
});

test.describe('at a desktop width', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a guest opening the form signs in and comes back to it, joins Euroleague 2027/28, then switches back to 2026/27', async ({
    page,
  }) => {
    const context = page.getByTestId('rail-context');
    // Next's route announcer is an alert too: the page's messages are main's.
    const main = page.locator('main');

    // Signed out, the form sends them to sign in, and sign-in back to it.
    await page.goto('/');
    await answerCookies(page);
    await page.goto(FORM);
    await expect(page).toHaveURL('/');
    await signIn(page, who);
    await expect(page).toHaveURL(FORM);
    await expect(context.getByText('Euroleague 2026/27')).toBeVisible();

    // The card's link leads to the same form.
    await page.goto('/');
    await page
      .getByTestId('hub-group-upcoming')
      .getByRole('link', { name: 'Registruotis į turnyrą →' })
      .click();
    await expect(page).toHaveURL(FORM);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Registracija į turnyrą' }),
    ).toBeVisible();

    // Unconfirmed: back with sportbet's message.
    await page.getByRole('button', { name: 'Registruotis į turnyrą' }).click();
    await expect(page).toHaveURL(FORM);
    await expect(main.getByRole('alert')).toHaveText(
      'Patvirtinkite, kad norite dalyvauti šiame turnyre.',
    );

    await page.getByRole('checkbox', { name: CONFIRM }).check();
    await page.getByRole('button', { name: 'Registruotis į turnyrą' }).click();
    await expect(page).toHaveURL('/');
    await expect(main.getByRole('status')).toHaveText(
      'Užsiregistravote į turnyrą: Euroleague 2027/28',
    );
    await expect(context.getByText('Euroleague 2027/28')).toBeVisible();
    // The message is shown once.
    await page.reload();
    await expect(main.getByRole('status')).toHaveCount(0);

    // "Keisti turnyrą" goes to the hub; "Žaisti" on 2026/27 takes them there.
    await context.getByRole('link', { name: 'Keisti turnyrą' }).click();
    await expect(page).toHaveURL('/');
    await page
      .getByTestId('hub-group-active')
      .getByRole('button', { name: 'Žaisti →' })
      .click();
    await expect(page).toHaveURL('/');
    await expect(context.getByText('Euroleague 2026/27')).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);

    // R-53: a player in the tournament opening its form is taken into it.
    await page.goto(FORM);
    await expect(page).toHaveURL('/');
    await expect(context.getByText('Euroleague 2027/28')).toBeVisible();

    // R-50: a non-public tournament's form is not found.
    const response = await page.goto(
      '/tournament/bandomasis-turnyras/register',
    );
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Puslapis nerastas',
        exact: true,
      }),
    ).toBeVisible();
  });
});
