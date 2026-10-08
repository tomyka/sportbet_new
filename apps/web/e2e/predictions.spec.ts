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
  browser,
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

  // The seeded account is a superadmin (R-26 amended): the rail links
  // "Administravimas", and its page has sportbet's three tiles.
  await page.goto('/');
  await rail.getByRole('link', { name: 'Administravimas' }).click();
  await expect(page).toHaveURL('/admin/index');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Admin skydelis' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Rezultatai (turas)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Perskaičiuoti taškus' }),
  ).toBeVisible();

  // "Visi rezultatai": the started game takes a result, saved when a box
  // is left or Enter pressed, never per keystroke. One box alone is
  // yellow and not sent; both, green.
  await page.getByRole('link', { name: 'Visi rezultatai' }).click();
  await expect(page).toHaveURL('/admin/resultsAll');
  const resultHome = page.getByLabel(
    'Real Madrid - Zalgiris Kaunas: namų komanda',
  );
  const resultAway = page.getByLabel(
    'Real Madrid - Zalgiris Kaunas: svečių komanda',
  );
  await resultHome.fill('85');
  await resultHome.press('Tab');
  await expect(resultHome).toHaveClass(/border-warn/);
  await resultAway.fill('80');
  await resultAway.press('Enter');
  await expect(resultAway).toHaveClass(/border-ok/);

  // The predictions list shows the game scored.
  const scored = page.getByTestId('scored-line').filter({ hasText: '85:80' });
  await page.goto('/prediction/results?event=all');
  await expect(scored).toBeVisible();
  await expect(started).toHaveCount(0);

  // The game page (slice 8): the rail's "Pradžia" is /main, the player's
  // home, with its progress line, tiles, table, deck and games.
  await rail.getByRole('link', { name: 'Pradžia' }).click();
  await expect(page).toHaveURL('/main');
  await expect(page.locator('[data-panel="progress"]')).toBeVisible();
  await expect(page.locator('[data-panel="tiles"]')).toContainText('vieta');
  await expect(page.locator('[data-panel="league-table"]')).toContainText(
    'Taškų lentelė',
  );
  await expect(page.locator('[data-panel="league-table"]')).toContainText(
    'savininkas',
  );
  await expect(page.locator('[data-panel="fixture-deck"]')).toContainText(
    'Artimiausios rungtynės',
  );

  // "Visos rungtynės" takes no prediction (R-74 amended): a click on a game
  // opens its own page, whose boxes save as the list's do.
  const games = page.locator('[data-panel="games-list"]');
  await expect(games).toContainText('Visos rungtynės');
  await games
    .getByTestId('games-row')
    .filter({ hasText: '90:85' })
    .getByRole('link')
    .first()
    .click();
  await expect(page).toHaveURL('/prediction/game/9001');
  const singleAway = page.getByLabel('Real Madrid');
  await singleAway.fill('84');
  await expect(singleAway).toHaveClass(/border-ok/);
  await page.goto('/prediction/results');
  await expect(open.getByLabel('Real Madrid')).toHaveValue('84');

  // A guest, while the game has a result: the rail offers "Lyderiai", and
  // /leaderboard lists the players.
  const guest = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const guestPage = await guest.newPage();
  await guestPage.goto('/');
  const guestRail = guestPage.getByTestId('rail');
  await guestRail.getByRole('link', { name: 'Lyderiai' }).click();
  await expect(guestPage).toHaveURL('/leaderboard');
  await expect(
    guestPage.getByText('Lyderių lentelė', { exact: true }),
  ).toBeVisible();
  await expect(
    guestPage.getByText('savininkas', { exact: true }),
  ).toBeVisible();

  // Cleared: grey, and the list shows the game locked again.
  await page.goto('/admin/resultsAll');
  await resultHome.fill('');
  await resultAway.fill('');
  await resultAway.press('Enter');
  await expect(resultAway).not.toHaveClass(/border-ok|border-warn/);
  await page.goto('/prediction/results?event=all');
  await expect(started.getByLabel('Real Madrid')).toBeDisabled();
  await expect(scored).toHaveCount(0);

  // With no result left, the guest's rail stops offering "Lyderiai"
  // (issue 131), and /leaderboard says why it is empty.
  await guestPage.goto('/');
  await expect(guestRail.getByRole('link', { name: 'Lyderiai' })).toHaveCount(
    0,
  );
  await guestPage.goto('/leaderboard');
  await expect(
    guestPage.getByText('Lyderių lentelė', { exact: true }),
  ).toBeVisible();
  await guest.close();

  // At a phone width: the "Spėjimai" tab, and no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/prediction/results');
  await expect(
    page.getByTestId('bottom-tabs').getByRole('link', { name: 'Spėjimai' }),
  ).toBeVisible();
  await expect(open.getByLabel('Zalgiris Kaunas')).toHaveValue('90');
  expect(await scrollsSideways(page)).toBe(false);
  await page.goto('/main');
  await expect(page.locator('[data-panel="league-table"]')).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  await page.goto('/admin/resultsAll');
  await expect(resultHome).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
});
