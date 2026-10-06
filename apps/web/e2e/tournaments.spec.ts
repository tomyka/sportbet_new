import { expect, test, type Page } from '@playwright/test';

// The hub and the tournament page (slice 5, #19), against the staging
// seed (packages/db/src/seed/staging.ts): 2026/27 active with one game on
// 2027-03-04, 2027/28 upcoming, 2025/26 finished, and "Bandomasis
// turnyras" finished and non-public (R-50).

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test("a visitor sees the hub's three groups in sportbet's order, and not the non-public tournament", async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Turnyrai' }),
  ).toBeAttached();
  const active = page.getByTestId('hub-group-active');
  const upcoming = page.getByTestId('hub-group-upcoming');
  const finished = page.getByTestId('hub-group-finished');
  await expect(
    active.getByRole('heading', { name: 'Euroleague 2026/27' }),
  ).toBeVisible();
  await expect(
    upcoming.getByRole('heading', { name: 'Euroleague 2027/28' }),
  ).toBeVisible();
  await expect(
    finished.getByRole('heading', { name: 'Euroleague 2025/26' }),
  ).toBeVisible();
  await expect(page.getByText('Bandomasis turnyras')).toHaveCount(0);
  const groups = await page
    .locator('[data-testid^="hub-group-"]')
    .evaluateAll((sections) =>
      sections.map((section) => section.getAttribute('data-testid')),
    );
  expect(groups).toEqual([
    'hub-group-active',
    'hub-group-upcoming',
    'hub-group-finished',
  ]);
});

test("a visitor's active card lists its next game in Vilnius time, and its stats; the upcoming card explains the game", async ({
  page,
}) => {
  await page.goto('/');
  const active = page.getByTestId('hub-group-active');
  await expect(active.getByTestId('upcoming-games')).toContainText(
    'kovo 4 d., 20:00',
  );
  await expect(active.getByTestId('upcoming-games')).toContainText(
    'Zalgiris Kaunas vs Real Madrid',
  );
  await expect(active.getByTestId('stats')).toContainText('dalyviai');
  await expect(
    page.getByTestId('hub-group-upcoming').getByTestId('how-it-works'),
  ).toBeVisible();
});

// hub.blade.php, issue 105: a signed-out visitor gets no button on an
// active or an upcoming card.
test('a visitor gets no button on an active or an upcoming card', async ({
  page,
}) => {
  await page.goto('/');
  for (const group of ['hub-group-active', 'hub-group-upcoming']) {
    const card = page.getByTestId(group).getByTestId('tournament-card');
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('button')).toHaveCount(0);
    await expect(card.getByRole('link')).toHaveCount(0);
  }
});

test('a finished card leads to its results page, which shows only the way back', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByTestId('hub-group-finished')
    .getByRole('link', { name: 'Peržiūrėti rezultatus →' })
    .click();
  await expect(page).toHaveURL('/tournament/euroleague-2025-26');
  await expect(page.getByText('dalyviai')).toHaveCount(0);
  await page.getByRole('link', { name: '← Turnyrai', exact: true }).click();
  await expect(page).toHaveURL('/');
});

test("an active tournament's page: its header, and the way to sign in for it", async ({
  page,
}) => {
  await page.goto('/tournament/euroleague-2026-27');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Euroleague 2026/27' }),
  ).toBeVisible();
  await expect(
    page.getByText(/^Krepšinis · 2026 · [0-9]+ dalyviai$/),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Prisijungti ir dalyvauti' }),
  ).toHaveAttribute('href', '/login?tournament=euroleague-2026-27');
});

// Next 16.3.6 draws a page's notFound() in the browser, from the 404's
// flight data (tests/feature/routes.test.ts), so this is the proof that
// the not-found page stands inside the shell.
const NOT_FOUND = [
  '/tournament/no-such-tournament',
  '/tournament/bandomasis-turnyras',
];

async function expectNotFoundAt(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Puslapis nerastas',
      exact: true,
    }),
  ).toBeVisible();
}

test.describe('at a desktop width', () => {
  test.use({ viewport: DESKTOP });

  test('an unknown tournament, and a non-public one, are a 404 page inside the shell, beside the rail', async ({
    page,
  }) => {
    for (const path of NOT_FOUND) {
      await expectNotFoundAt(page, path);
      await expect(page.getByTestId('rail')).toBeVisible();
    }
  });
});

test.describe('at a phone width', () => {
  test.use({ viewport: PHONE });

  test('an unknown tournament, and a non-public one, are a 404 page inside the shell, under the phone bar', async ({
    page,
  }) => {
    for (const path of NOT_FOUND) {
      await expectNotFoundAt(page, path);
      await expect(page.getByTestId('phone-header')).toBeVisible();
    }
  });
});
