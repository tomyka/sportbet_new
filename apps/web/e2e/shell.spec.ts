import { expect, test, type Page } from '@playwright/test';

// The guest shell (spec 4a, issue #15): sportbet's frame at a phone's
// width and a desktop's, the theme from 'sb-theme', the cookie banner's
// answer remembered, and nothing fetched from another origin. Runs in CI
// against the stack built from this commit, and again against staging.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** sportbet's LayoutOverflowRegressionTest, in a browser: the page never scrolls sideways. */
async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

test.describe('at a phone width', () => {
  test.use({ viewport: PHONE });

  test('shows the phone bar, not the rail, and never scrolls sideways', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'lt');
    await expect(page.getByTestId('phone-header')).toBeVisible();
    await expect(page.getByTestId('rail')).toBeHidden();
    await expect(page.getByTestId('bottom-tabs')).toHaveCount(0);
    expect(await scrollsSideways(page)).toBe(false);
  });
});

test.describe('at a desktop width', () => {
  test.use({ viewport: DESKTOP });

  test('shows the rail with Turnyrai as the current page, and never scrolls sideways', async ({
    page,
  }) => {
    await page.goto('/');
    const rail = page.getByTestId('rail');
    await expect(rail).toBeVisible();
    await expect(page.getByTestId('phone-header')).toBeHidden();
    await expect(
      rail.getByRole('link', { name: 'Turnyrai', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    expect(await scrollsSideways(page)).toBe(false);
  });

  test('clips sideways overflow on main, never on body', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveCSS('overflow-x', 'visible');
    await expect(page.locator('body')).toHaveCSS('overflow-y', 'visible');
    await expect(page.locator('main')).toHaveCSS('overflow-x', 'hidden');
  });

  test('draws the logo from the app itself', async ({ page }) => {
    await page.goto('/');
    const logo = page.getByTestId('rail').locator('img');
    await expect(logo).toHaveAttribute(
      'src',
      /^\/_next\/image\?url=%2Fimg%2Flogo\.png/,
    );
    await expect
      .poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  });
});

// sportbet's switch: the rail is d-none d-lg-flex and the phone bar
// d-lg-none, Bootstrap's lg at 992px.
test('switches from the phone bar to the rail at 992px', async ({ page }) => {
  await page.setViewportSize({ width: 991, height: 800 });
  await page.goto('/');
  await expect(page.getByTestId('phone-header')).toBeVisible();
  await expect(page.getByTestId('rail')).toBeHidden();

  await page.setViewportSize({ width: 992, height: 800 });
  await expect(page.getByTestId('rail')).toBeVisible();
  await expect(page.getByTestId('phone-header')).toBeHidden();
});

// Every page sits in the shell (spec 4a, "Done means"), the 404 page too:
// sportbet's layouts/master frames each of them.
const PAGES = [
  { name: 'the tournament list', path: '/' },
  { name: 'a tournament', path: '/tournament/euroleague-2025-26' },
  { name: 'an unknown page', path: '/no-such-page' },
  { name: 'an unknown tournament', path: '/tournament/no-such-tournament' },
];

for (const { name, path } of PAGES) {
  test(`frames ${name} in the shell at both widths`, async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(path);
    await expect(page.getByTestId('rail')).toBeVisible();
    await expect(page.getByTestId('phone-header')).toBeHidden();
    await expect(page.locator('main h1')).toBeVisible();

    await page.setViewportSize(PHONE);
    await expect(page.getByTestId('phone-header')).toBeVisible();
    await expect(page.getByTestId('rail')).toBeHidden();
    expect(await scrollsSideways(page)).toBe(false);
  });
}

test.describe('the theme', () => {
  test('is light for a first-time visitor', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
  });

  test("is dark when 'sb-theme' says dark", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sb-theme', 'dark');
    });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(14, 18, 22)',
    );
  });

  test("stays light for any other 'sb-theme'", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sb-theme', 'light');
    });
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
  });
});

test.describe('the cookie banner', () => {
  test('asks a first-time visitor and remembers "Sutinku", loading no ad off production', async ({
    page,
  }) => {
    await page.goto('/');
    const banner = page.getByTestId('cookie-consent');
    await expect(banner).toHaveAttribute('data-state', 'asking');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Sutinku' }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await expect(banner).toHaveAttribute('data-state', 'answered');
    await expect(banner).toBeHidden();
    expect(
      await page.evaluate(() => localStorage.getItem('sb_cookie_consent')),
    ).toBe('accepted');
    await expect(page.locator('script[src*="adsbygoogle"]')).toHaveCount(0);
  });

  test('remembers "Tik būtini"', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByTestId('cookie-consent');
    await banner.getByRole('button', { name: 'Tik būtini' }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await expect(banner).toHaveAttribute('data-state', 'answered');
    await expect(banner).toBeHidden();
    expect(
      await page.evaluate(() => localStorage.getItem('sb_cookie_consent')),
    ).toBe('declined');
  });
});

test('fetches nothing from another origin, at either width', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    requested.push(request.url());
  });

  await page.setViewportSize(PHONE);
  await page.goto('/');
  const banner = page.getByTestId('cookie-consent');
  await expect(banner).toHaveAttribute('data-state', 'asking');
  await page.setViewportSize(DESKTOP);
  await page.reload();
  await banner.getByRole('button', { name: 'Sutinku' }).click();
  await expect(banner).toHaveAttribute('data-state', 'answered');

  const origin = new URL(page.url()).origin;
  const elsewhere = requested
    .map((url) => new URL(url))
    .filter((url) => url.protocol.startsWith('http'))
    .filter((url) => url.origin !== origin)
    .map((url) => url.href);
  expect(elsewhere).toEqual([]);
});
