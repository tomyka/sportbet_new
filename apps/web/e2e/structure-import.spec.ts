import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { scrollsSideways } from './support/newcomer';
import { savininkasContext } from './support/savininkas';

// Bringing a Euroleague season into a tournament (slice 15, #32) as the
// seeded superadmin (signed in by predictions.spec.ts's session, which this
// file sorts after, or by a mailed code when run alone): create a tournament
// and choose it, preview the season, import it, preview again and read
// "Viskas jau atnaujinta". The stack reads sportbet's fixture (20 games,
// rounds 1 and 2), never the live feed. At a desktop and a phone width, each
// with a tournament of its own (a slug is unique), hidden from the hub.

test.describe.configure({ mode: 'serial' });

const WIDTHS = [
  { name: 'desktop', width: 1280, height: 800, ip: '192.0.2.93' },
  { name: 'phone', width: 390, height: 844, ip: '192.0.2.94' },
] as const;

const said = (page: Page, text: string | RegExp) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();

/** The tournament form, filled and sent: a name, a slug, not public. */
async function createTournament(
  page: Page,
  name: string,
  slug: string,
): Promise<void> {
  await page.goto('/admin/tournaments/create');
  await page.getByLabel('Pavadinimas', { exact: true }).fill(name);
  await page.getByLabel('Slug (URL)').fill(slug);
  await page.getByLabel('Viešas').uncheck();
  await page.getByRole('button', { name: 'Sukurti', exact: true }).click();
  await expect(page).toHaveURL('/admin/tournaments');
  await said(page, 'Turnyras sukurtas.');
}

/** "▶ Kontekstas" on the tournament's row: the dashboard names it. */
async function work(page: Page, name: string): Promise<void> {
  await page
    .getByTestId('tournament-row')
    .filter({ hasText: name })
    .getByRole('button', { name: '▶ Kontekstas' })
    .click();
  await expect(page).toHaveURL('/admin/index');
  await said(page, `Turnyro kontekstas: ${name}`);
}

/** The preview of E2026, from the form: nothing is written by looking. */
async function preview(page: Page): Promise<void> {
  await page.goto('/admin/import');
  await expect(page.getByLabel('Sezono kodas')).toHaveValue('E2026');
  await page.getByRole('button', { name: 'Peržiūrėti' }).click();
  await expect(page).toHaveURL('/admin/import/preview?season=E2026');
  await expect(
    page.getByRole('heading', { name: 'Ką padarys importas' }),
  ).toBeVisible();
}

async function signedIn(
  browser: Browser,
  width: (typeof WIDTHS)[number],
): Promise<BrowserContext> {
  return savininkasContext(
    browser,
    { width: width.width, height: width.height },
    width.ip,
  );
}

for (const width of WIDTHS) {
  test(`import a season from the fixture at a ${width.name} width`, async ({
    browser,
  }) => {
    // A dozen pages and a sign-in fallback.
    test.setTimeout(180_000);
    const suffix = `${width.name}${String(Date.now())}`;
    const name = `Importas ${suffix}`;
    const context = await signedIn(browser, width);
    const page = await context.newPage();

    // The dashboard offers the tile to a superadmin.
    await page.goto('/admin/index');
    await page
      .getByRole('link', { name: 'Tvarkaraščio importas', exact: true })
      .click();
    await expect(page).toHaveURL('/admin/import');

    await createTournament(page, name, `importas-${suffix}`);
    await work(page, name);

    // A season code that is none is refused, and the form stays.
    await page.goto('/admin/import');
    await expect(page.getByRole('note')).toContainText(name);
    await page.getByLabel('Sezono kodas').fill('E26');
    await page.getByRole('button', { name: 'Peržiūrėti' }).click();
    // The browser's own pattern check holds a code that is none back.
    await expect(page).toHaveURL('/admin/import');

    await preview(page);
    await expect(page.getByTestId('import-counts')).toContainText(
      'Naujos komandos: 20',
    );
    await expect(page.getByTestId('import-counts')).toContainText(
      'Nauji turai: 2',
    );
    await expect(page.getByTestId('import-counts')).toContainText(
      'Naujos rungtynės: 20',
    );
    await expect(page.getByTestId('import-counts')).not.toContainText(
      'Komandos be logotipo',
    );
    expect(await scrollsSideways(page)).toBe(false);

    // The import asks first, then says what it did.
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe('Importuoti tvarkaraštį į šį turnyrą?');
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'Importuoti' }).click();
    await expect(page).toHaveURL('/admin/import');
    await said(
      page,
      /^Importuota: 20 komandų, 2 turų, 20 naujų rungtynių, 0 perkeltų, 0 neperkeltų\. Spėjimų eilutės sukurtos \d+ žaidėjams\.$/,
    );
    expect(await scrollsSideways(page)).toBe(false);

    // Looked at again, there is nothing to change and nothing to import.
    await preview(page);
    await said(page, 'Viskas jau atnaujinta - nieko keisti nereikia.');
    await expect(
      page.getByRole('button', { name: 'Importuoti' }),
    ).toBeDisabled();
    expect(await scrollsSideways(page)).toBe(false);

    // The season is in the tournament: its two rounds are on the rounds page.
    await page.goto('/admin/events');
    await expect(page.getByTestId('round-count')).toHaveText('2');
    await context.close();
  });
}
