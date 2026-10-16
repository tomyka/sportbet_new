import { expect, test, type Page } from '@playwright/test';
import { answerCookies, scrollsSideways } from './support/newcomer';
import { savininkasContext } from './support/savininkas';

// The static pages (slice 18, #35): /rules, /help and /charity from the
// navigation, /support and /sponsors answered by redirects. At a desktop width a guest reads
// them from the rail and the hub's charity card; at a phone width a player
// reaches "Taisyklės" from the menu's "Informacija" block and a guest has
// the "Jaunimo linija" pill (a guest has no menu, as in sportbet, R-133 Q10).
// /privacy carries the owner-approved text (R-108, 2026-10-16).

const DESKTOP = { width: 1280, height: 800, ip: '192.0.2.131' } as const;
const PHONE = { width: 390, height: 844, ip: '192.0.2.132' } as const;

/**
 * Every image of the page's content has loaded (the shell's hidden phone logo never does): the files are the app's own, served by
 * the image. Images below the fold load lazily, so each is scrolled to first.
 */
async function imagesLoaded(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const images = Array.from(
      document.querySelectorAll<HTMLImageElement>('main img'),
    );
    for (const image of images) image.scrollIntoView();
    return (
      images.length > 0 &&
      images.every((image) => image.complete && image.naturalWidth > 0)
    );
  });
}

test('a guest reads the rules, the help and the charity page from the rail, at a desktop width', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: DESKTOP.width, height: DESKTOP.height },
    extraHTTPHeaders: { 'x-forwarded-for': DESKTOP.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await answerCookies(page);
  const rail = page.getByTestId('rail');

  await rail.getByRole('link', { name: 'Taisyklės' }).click();
  await expect(page).toHaveURL('/rules');
  // The ruled rates (R-10), the serija step (R-106) and the tie-break (R-107).
  await expect(page.getByText('×1 / ×2 / ×3')).toBeVisible();
  await expect(page.getByText('+(N−1)×5').first()).toBeVisible();
  await expect(
    page.getByText('Skaičiuojama pagal rungtynių pradžios laiką.'),
  ).toBeVisible();
  await expect(page.getByText('Atkrintamosios (1/4)')).toBeVisible();
  await expect.poll(() => scrollsSideways(page)).toBe(false);

  await rail.getByRole('link', { name: 'Pagalba' }).click();
  await expect(page).toHaveURL('/help');
  await expect(page.getByAltText('Rungtynių rezultatų spėjimas')).toBeVisible();
  await expect.poll(() => imagesLoaded(page)).toBe(true);
  await expect.poll(() => scrollsSideways(page)).toBe(false);

  await rail.getByRole('link', { name: 'Jaunimo linija' }).click();
  await expect(page).toHaveURL('/charity');
  await expect(
    page.getByRole('heading', { name: 'Žaidžiame dėl gero tikslo' }),
  ).toBeVisible();
  await expect(page.getByTestId('charity-proof')).toHaveCount(11);
  await expect.poll(() => imagesLoaded(page)).toBe(true);
  await context.close();
});

test('the cookie banner links to the privacy page, which carries the approved fixes (R-108)', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: DESKTOP.width, height: DESKTOP.height },
    extraHTTPHeaders: { 'x-forwarded-for': DESKTOP.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page
    .getByTestId('cookie-consent')
    .getByRole('link', { name: 'privatumo politika' })
    .click();
  await expect(page).toHaveURL('/privacy');
  await expect(
    page.getByRole('heading', { name: 'Privatumo politika' }),
  ).toBeVisible();
  await expect(page.getByText('Atnaujinta: 2026 m. spalio mėn.')).toBeVisible();
  await expect(
    page.getByText(
      'Galioja 90 dienų ir pratęsiamas kiekvieno apsilankymo metu',
    ),
  ).toBeVisible();
  await expect.poll(() => scrollsSideways(page)).toBe(false);
  await context.close();
});

test("the hub's charity card leads to the charity page, and /support and /sponsors redirect", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({
    viewport: { width: DESKTOP.width, height: DESKTOP.height },
    extraHTTPHeaders: { 'x-forwarded-for': DESKTOP.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page
    .getByTestId('charity-card')
    .getByRole('link', { name: /Sužinoti daugiau/ })
    .click();
  await expect(page).toHaveURL('/charity');
  await context.close();

  const support = await request.get('/support', { maxRedirects: 0 });
  expect(support.status()).toBe(308);
  expect(support.headers()['location']).toBe('/charity');
  const sponsors = await request.get('/sponsors', { maxRedirects: 0 });
  expect(sponsors.status()).toBe(308);
  expect(sponsors.headers()['location']).toBe('/');
});

test('at a phone width a player opens "Taisyklės" from the menu\'s Informacija block', async ({
  browser,
}) => {
  const context = await savininkasContext(
    browser,
    { width: PHONE.width, height: PHONE.height },
    PHONE.ip,
  );
  const page = await context.newPage();
  await page.goto('/main');
  await page.getByRole('button', { name: 'Atidaryti meniu' }).click();
  await expect(page.getByText('Informacija', { exact: true })).toBeVisible();
  await page
    .getByTestId('phone-header')
    .getByRole('link', { name: 'Taisyklės' })
    .click();
  await expect(page).toHaveURL('/rules');
  await expect(page.getByText('×1 / ×2 / ×3')).toBeVisible();
  await expect.poll(() => scrollsSideways(page)).toBe(false);
  await context.close();
});

test('at a phone width a guest has the "Jaunimo linija" pill, which opens the charity page', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: PHONE.width, height: PHONE.height },
    extraHTTPHeaders: { 'x-forwarded-for': PHONE.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await answerCookies(page);
  await page
    .getByTestId('phone-header')
    .getByRole('link', { name: /Jaunimo linija/ })
    .click();
  await expect(page).toHaveURL('/charity');
  await expect.poll(() => scrollsSideways(page)).toBe(false);
  await context.close();
});
