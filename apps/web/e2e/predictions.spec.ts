import { expect, test } from '@playwright/test';
import { answerCookies, scrollsSideways, signIn } from './support/newcomer';

// Predicting (slice 6, #20) as the seeded account (infra/compose/e2e.yml's
// STAGING_ACCOUNT_EMAIL), which the staging seed puts in Euroleague 2026/27
// with a blank row for game 9001 (Zalgiris Kaunas - Real Madrid, to come)
// and 9002 (Real Madrid - Zalgiris Kaunas, started). One sign-in for the
// whole journey: the address allows three codes in ten minutes and
// sign-in.spec.ts uses two (decision 10).

const PLAYER = {
  username: 'savininkas',
  name: 'Savininkas',
  surname: '',
  email: 'e2e.player@sportbet.test',
};

test.describe.configure({ mode: 'serial' });

test("from the mail's game link through sign-in, to the list, its autosave and odds, a locked game, and the phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  // The cookie bar first: the sign-in dialog the link opens covers it.
  await page.goto('/');
  await answerCookies(page);

  // The reminder mail's link, signed out: sign in, and land back on it.
  await page.goto('/prediction/game/9001');
  await expect(page).toHaveURL('/');
  await signIn(page, PLAYER);
  await expect(page).toHaveURL('/prediction/game/9001');
  const form = page.getByTestId('single-game-form');
  await form.getByLabel('Zalgiris Kaunas').fill('88');
  await form.getByLabel('Real Madrid').fill('79');
  // R-62: saved as typed, like the list; the player stays on the page.
  await expect(form.getByLabel('Zalgiris Kaunas')).toHaveClass(/border-ok/);
  await expect(page).toHaveURL('/prediction/game/9001');

  // The list: the pair kept, the badge gone.
  const rail = page.getByTestId('rail');
  await rail.getByRole('link', { name: 'Spėjimai' }).click();
  await expect(page).toHaveURL('/prediction/results');
  const open = page.locator('[data-testid="prediction-row"][data-game="9001"]');
  await expect(open.getByLabel('Zalgiris Kaunas')).toHaveValue('88');
  await expect(open.getByLabel('Real Madrid')).toHaveValue('79');
  await expect(rail.locator('[data-missing="results"]')).toBeHidden();

  // Cleared: the badge is back.
  await open.getByLabel('Real Madrid').fill('');
  await open.getByLabel('Zalgiris Kaunas').fill('');
  await expect(rail.locator('[data-missing="results"]')).toBeVisible();

  // Saved again as it is typed: green, and the odds panel opens.
  await open.getByLabel('Zalgiris Kaunas').fill('90');
  await open.getByLabel('Real Madrid').fill('85');
  await expect(open.getByLabel('Zalgiris Kaunas')).toHaveClass(/border-ok/);
  await open.getByRole('button', { name: 'Koeficientai' }).click();
  await expect(open.getByTestId('odds-panel')).toContainText('pt');

  // A level pair is refused in sportbet's words, then put right.
  await open.getByLabel('Real Madrid').fill('90');
  await expect(open.getByRole('alert')).toHaveText(
    'Lygiosios negalimos - komandų rezultatai turi skirtis.',
  );
  await open.getByLabel('Real Madrid').fill('85');
  await expect(open.getByLabel('Real Madrid')).toHaveClass(/border-ok/);

  // The started game: locked on the list, and on its own page.
  const started = page.locator(
    '[data-testid="prediction-row"][data-game="9002"]',
  );
  await expect(started.getByLabel('Real Madrid')).toBeDisabled();
  await page.goto('/prediction/game/9002');
  await expect(
    page.getByText('Žaidimas jau prasidėjo - spėjimų keisti negalima.'),
  ).toBeVisible();

  // At a phone width: the "Spėjimai" tab, and no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/prediction/results');
  await expect(
    page.getByTestId('bottom-tabs').getByRole('link', { name: 'Spėjimai' }),
  ).toBeVisible();
  await expect(open.getByLabel('Zalgiris Kaunas')).toHaveValue('90');
  expect(await scrollsSideways(page)).toBe(false);
});
