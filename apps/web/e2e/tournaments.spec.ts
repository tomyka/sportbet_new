import { expect, test } from '@playwright/test';

// The staging seed (packages/db/src/seed/staging.ts): every environment E2E
// runs against is seeded with it.
const EURO = {
  name: 'Euro 2028',
  path: '/tournament/euro-2028',
  format: 'Football',
};
const EUROLEAGUE = { name: 'Euroleague 2026/27' };

test('a visitor goes from the list to a tournament and back', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tournaments', exact: true }),
  ).toBeVisible();

  await page.getByRole('link', { name: EURO.name, exact: true }).click();
  await expect(page).toHaveURL(EURO.path);
  await expect(
    page.getByRole('heading', { level: 1, name: EURO.name, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(`Format: ${EURO.format}`)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('link', { name: EUROLEAGUE.name, exact: true }),
  ).toBeVisible();
});

test('the link on a tournament page leads back to the list', async ({
  page,
}) => {
  await page.goto(EURO.path);
  await page
    .getByRole('link', { name: 'All tournaments', exact: true })
    .click();
  await expect(page).toHaveURL('/');
});

test('an unknown tournament is a 404 page', async ({ page }) => {
  const response = await page.goto('/tournament/no-such-tournament');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Not found', exact: true }),
  ).toBeVisible();
});
