import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { codesTo, waitForCodes } from '../tests/support/mailpit';
import { scrollsSideways } from './support/newcomer';
import { SAVININKAS, savininkasContext } from './support/savininkas';

// Running a tournament from the admin (slice 13, #30) as the seeded
// superadmin (signed in by predictions.spec.ts's session, which this file
// sorts after, or by a mailed code when run alone): create a tournament and choose it, give it teams (and rename
// one), a round and a game at a Vilnius time (a clock-change hour refused,
// the UTC shown), move the game, enter the standings facts and mark the
// table final (refused while incomplete), and delete the fresh game with
// the code Mailpit received. At a desktop and a phone width, each with a
// tournament of its own (a slug is unique), hidden from the hub (not
// public) so the other specs' hub is untouched.

const MAILPIT = process.env['E2E_MAILPIT_URL'] ?? '';

test.describe.configure({ mode: 'serial' });

const WIDTHS = [
  { name: 'desktop', width: 1280, height: 800, ip: '192.0.2.91' },
  { name: 'phone', width: 390, height: 844, ip: '192.0.2.92' },
] as const;

const said = (page: Page, text: string | RegExp) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();

const refused = (page: Page, text: string | RegExp) =>
  expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();

/** The tournament form, filled and sent: a name, a slug, not public. */
async function createTournament(
  page: Page,
  name: string,
  slug: string,
): Promise<void> {
  await page.getByRole('link', { name: /Naujas turnyras/ }).click();
  await expect(page).toHaveURL('/admin/tournaments/create');
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

/** Four placeholder teams, and the first two renamed. */
async function teams(page: Page): Promise<void> {
  await page.goto('/admin/teams');
  await page.getByLabel('Įveskite komandų kiekį:').fill('4');
  await page.getByRole('button', { name: 'Sukurti komandas' }).click();
  await said(page, 'Pridėta komandų: 4.');
  for (const [from, to] of [
    ['team1', 'Žalgiris'],
    ['team2', 'Real'],
  ] as const) {
    await page
      .getByRole('button', { name: `Redaguoti komandą ${from}` })
      .click();
    const dialog = page.getByRole('dialog', { name: `Redaguoti: ${from}` });
    await dialog.getByLabel('Pavadinimas').fill(to);
    await dialog.getByRole('button', { name: 'Išsaugoti' }).click();
    await said(page, 'Komanda atnaujinta');
    await expect(
      page.getByTestId('team-row').filter({ hasText: to }),
    ).toBeVisible();
  }
}

/** A round whose rate follows its stage (R-10), then changed in its own row, which saves itself. */
async function round(page: Page): Promise<void> {
  await page.goto('/admin/events');
  await page.getByLabel('Naujo turo pavadinimas').fill('1 turas');
  await page.getByLabel('Naujo turo diena').fill('1');
  const stage = page.getByLabel('Naujo turo etapas');
  const rate = page.getByLabel('Naujo turo koeficientas');
  await stage.selectOption('play-offs');
  await expect(rate).toHaveValue('2');
  await stage.selectOption('regular');
  await expect(rate).toHaveValue('1');
  await page.getByRole('button', { name: 'Pridėti turą' }).click();
  await said(page, 'Turas pridėtas.');
  const row = page
    .getByTestId('round-row')
    .filter({ has: page.locator('input[value="1 turas"]') });
  await row.getByLabel('Koeficientas').fill('2');
  await row.getByLabel('Koeficientas').blur();
  await said(page, 'Turas atnaujintas.');
  await expect(
    page
      .getByTestId('round-row')
      .filter({ has: page.locator('input[value="1 turas"]') })
      .getByLabel('Koeficientas'),
  ).toHaveValue('2');
}

/** A game: a clock-change hour refused with the UTC shown for a real one (R-91), then saved; its number. */
async function addGame(page: Page): Promise<string> {
  await page.goto('/admin/games');
  await page.getByRole('button', { name: 'Naujas', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Naujas žaidimas' });
  const time = dialog.getByLabel('Data ir laikas');
  await time.fill('2027-03-28T03:30');
  await expect(dialog.getByTestId('utc-preview')).toHaveText(
    'Šis laikas Vilniuje neegzistuoja (laikrodžio persukimas).',
  );
  await time.fill('2026-10-25T03:30');
  await expect(dialog.getByTestId('utc-preview')).toHaveText(
    'Šis laikas Vilniuje dviprasmiškas (laikrodžio persukimas).',
  );
  await time.fill('2027-02-02T20:00');
  await expect(dialog.getByTestId('utc-preview')).toHaveText(
    'Bus išsaugota: 2027-02-02 18:00 UTC',
  );
  await dialog.getByLabel('Šeimininkai').selectOption({ label: 'Žalgiris' });
  await dialog.getByLabel('Svečiai').selectOption({ label: 'Real' });
  await dialog.getByLabel('Etapas').selectOption({ label: '1 turas' });
  await dialog.getByRole('button', { name: 'Išsaugoti' }).click();
  const message = page
    .getByRole('status')
    .filter({ hasText: /^Žaidimas #\d+ pridėtas\.$/ });
  await expect(message).toBeVisible();
  const number = /#(\d+)/.exec((await message.textContent()) ?? '')?.[1];
  if (number === undefined) throw new Error('no game number in the message');
  const row = page.getByTestId('game-row').filter({ hasText: number });
  await expect(row).toContainText('Žalgiris');
  await expect(row).toContainText('Real');
  await expect(row).toContainText('vasario 2 d., 20:00');
  return number;
}

/** The game's time moved in its modal. */
async function moveGame(page: Page, number: string): Promise<void> {
  await page
    .getByRole('button', { name: `Redaguoti žaidimą #${number}` })
    .click();
  const dialog = page.getByRole('dialog', {
    name: `Redaguoti žaidimą #${number}`,
  });
  await expect(dialog.getByLabel('Data ir laikas')).toHaveValue(
    '2027-02-02T20:00',
  );
  await dialog.getByLabel('Data ir laikas').fill('2027-02-03T19:30');
  await dialog.getByRole('button', { name: 'Išsaugoti' }).click();
  await said(page, `Žaidimas #${number} atnaujintas.`);
  await expect(
    page.getByTestId('game-row').filter({ hasText: number }),
  ).toContainText('vasario 3 d., 19:30');
}

/** The standings facts: refused as final while incomplete, then complete and final. */
async function facts(page: Page): Promise<void> {
  await page.goto('/admin/teams');
  await page.getByLabel('Žalgiris: vieta').fill('1');
  await page.getByLabel('Real: vieta').fill('2');
  await page.getByLabel('Žalgiris: ketvirtfinalis').check();
  await page.getByLabel('Galutinė lentelė').check();
  await page.getByRole('button', { name: 'Išsaugoti', exact: true }).click();
  // Held back in the page, with the server's own words: the typed places stay.
  await refused(
    page,
    'Galutinė lentelė galima tik užpildžius visas vietas 1..4 be pasikartojimų.',
  );
  await expect(page.getByLabel('Žalgiris: vieta')).toHaveValue('1');
  await page.getByLabel('team3: vieta').fill('3');
  await page.getByLabel('team4: vieta').fill('4');
  await page.getByLabel('Galutinė lentelė').check();
  await page.getByRole('button', { name: 'Išsaugoti', exact: true }).click();
  await said(page, 'Komandos atnaujintos.');
  await expect(page.getByLabel('Galutinė lentelė')).toBeChecked();
  await expect(page.getByLabel('Žalgiris: vieta')).toHaveValue('1');
}

/** The fresh game deleted with the code Mailpit received: a wrong one first. */
async function deleteGame(page: Page, number: string): Promise<void> {
  await page.goto('/admin/games');
  await page
    .getByRole('button', { name: `Redaguoti žaidimą #${number}` })
    .click();
  const before = (await codesTo(MAILPIT, SAVININKAS.email)).length;
  await page
    .getByRole('dialog', { name: `Redaguoti žaidimą #${number}` })
    .getByRole('button', { name: 'Ištrinti žaidimą' })
    .click();
  await expect(page).toHaveURL('/admin/confirm');
  await expect(page.getByTestId('confirm-action')).toHaveText(
    new RegExp(`^Ištrinti žaidimą #${number}: Žalgiris - Real, `),
  );
  const code = (await waitForCodes(MAILPIT, SAVININKAS.email, before + 1)).at(
    -1,
  );
  if (code === undefined) throw new Error('no code was mailed');
  const box = page.getByLabel('8 skaitmenų kodas');
  await box.fill(code === '00000000' ? '11111111' : '00000000');
  await page.getByRole('button', { name: 'Patvirtinti' }).click();
  await expect(page).toHaveURL('/admin/confirm');
  await refused(page, 'Neteisingas arba pasibaigęs kodas.');
  await page.getByLabel('8 skaitmenų kodas').fill(code);
  await page.getByRole('button', { name: 'Patvirtinti' }).click();
  await expect(page).toHaveURL('/admin/games');
  await said(page, `Žaidimas #${number} ištrintas.`);
  await expect(page.getByTestId('game-row')).toHaveCount(0);
}

/** A context signed in as the seeded account, at `width`. */
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
  test(`run a tournament from the admin at a ${width.name} width`, async ({
    browser,
  }) => {
    // A dozen pages, a mailed code, and two sign-in fallbacks.
    test.setTimeout(240_000);
    const suffix = `${width.name}${String(Date.now())}`;
    const name = `Admin ${suffix}`;
    const context = await signedIn(browser, width);
    const page = await context.newPage();

    // The dashboard offers every structure tile; "Turnyrai" is one.
    await page.goto('/admin/index');
    for (const tile of ['Turnyrai', 'Turai', 'Žaidimai', 'Komandos']) {
      await expect(
        page.getByRole('link', { name: tile, exact: true }),
      ).toBeVisible();
    }
    await page.getByRole('link', { name: 'Turnyrai', exact: true }).click();
    await expect(page).toHaveURL('/admin/tournaments');

    await createTournament(page, name, `admin-${suffix}`);
    await work(page, name);
    await teams(page);
    await round(page);
    const number = await addGame(page);
    await moveGame(page, number);
    await facts(page);
    await deleteGame(page, number);

    // The message shows once, and no page of it scrolls sideways.
    await page.reload();
    await expect(page.getByRole('status')).toHaveCount(0);
    for (const path of [
      '/admin/tournaments',
      '/admin/events',
      '/admin/games',
      '/admin/teams',
    ]) {
      await page.goto(path);
      expect(await scrollsSideways(page)).toBe(false);
    }
    await context.close();
  });
}
