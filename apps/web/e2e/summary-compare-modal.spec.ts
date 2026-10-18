import { expect, test } from '@playwright/test';
import { savininkasContext } from './support/savininkas';

// (Runs after predictions.spec.ts, which saves the session it reuses and
// scores the game this comparison has a round for; Playwright runs the files
// in name order.)
// The league table's compare link opens sportbet's "Žaidėjų palyginimas"
// modal over the game page, as it did (#cmpModal): the URL and the table stay
// where they are, and the modal shuts with its button, a click on the
// backdrop and Escape. A direct visit of the link's address is still the
// whole page. A real browser says what jsdom cannot: it is in front of the
// page, fits the phone, and the page behind does not scroll.

const SIZES = [
  { width: 1280, height: 800, ip: '192.0.2.151' },
  { width: 390, height: 844, ip: '192.0.2.152' },
] as const;

/** A dialog with no box fails every bound below. */
const NO_BOX = { x: -1, y: -1, width: 0, height: 0 };

for (const size of SIZES) {
  test(`compare opens in a modal over the table at ${String(size.width)}x${String(size.height)}`, async ({
    browser,
  }) => {
    const context = await savininkasContext(browser, size, size.ip);
    const page = await context.newPage();
    await page.goto('/main');
    const table = page.locator('[data-panel="league-table"]');
    const nameLink = table.getByRole('link', { name: 'zaidejas' });
    await expect(nameLink).toBeVisible();
    const href = (await nameLink.getAttribute('href')) ?? '';
    expect(href).toMatch(/^\/compare\/[1-9][0-9]*$/u);

    // Open: the dialog is in front, labelled, with the card; the page behind
    // is still the table at the same address, and does not scroll.
    await nameLink.click();
    const dialog = page.getByRole('dialog', { name: 'Žaidėjų palyginimas' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Bendri statistikos')).toBeVisible();
    await expect(page).toHaveURL('/main');
    await expect(table).toBeAttached();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    const box = (await dialog.boundingBox()) ?? NO_BOX;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    const front = await page.evaluate(
      ([x, y]) =>
        document
          .elementFromPoint(x ?? 0, y ?? 0)
          ?.closest('[role="dialog"]') !== null,
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(front).toBe(true);
    await expect(dialog).toBeFocused();

    // Escape shuts it; focus is back on the link, and the page scrolls again.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL('/main');
    await expect(nameLink).toBeFocused();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');

    // The close button.
    await nameLink.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Uždaryti' }).click();
    await expect(dialog).toBeHidden();

    // A click on the backdrop, outside the dialog.
    await nameLink.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL('/main');

    // Without the modal, the link is the page: a direct visit shows it whole.
    await page.goto(href);
    await expect(page).toHaveURL(href);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Bendri statistikos')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Atgal' })).toBeVisible();
    await context.close();
  });
}
