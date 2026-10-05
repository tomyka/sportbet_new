import { expect, test } from '@playwright/test';

// The staging seed (packages/db/src/seed/staging.ts): every environment E2E
// runs against is seeded with it.
const EUROLEAGUE_A = {
  name: 'Euroleague 2025/26',
  path: '/tournament/euroleague-2025-26',
  format: 'Euroleague',
};
const EUROLEAGUE_B = { name: 'Euroleague 2026/27' };

test('a visitor goes from the list to a tournament and back', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Turnyrai', exact: true }),
  ).toBeVisible();

  await page
    .getByRole('link', { name: EUROLEAGUE_A.name, exact: true })
    .click();
  await expect(page).toHaveURL(EUROLEAGUE_A.path);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: EUROLEAGUE_A.name,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`Formatas: ${EUROLEAGUE_A.format}`),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('link', { name: EUROLEAGUE_B.name, exact: true }),
  ).toBeVisible();
});

test('the link on a tournament page leads back to the list', async ({
  page,
}) => {
  await page.goto(EUROLEAGUE_A.path);
  await page.getByRole('link', { name: '← Turnyrai', exact: true }).click();
  await expect(page).toHaveURL('/');
});

test('an unknown tournament is a 404 page', async ({ page }) => {
  const response = await page.goto('/tournament/no-such-tournament');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Puslapis nerastas',
      exact: true,
    }),
  ).toBeVisible();
});
