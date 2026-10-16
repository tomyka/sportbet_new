import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { codesTo, waitForCodes } from '../tests/support/mailpit';
import {
  newcomer,
  registered,
  scrollsSideways,
  type Newcomer,
} from './support/newcomer';
import { SAVININKAS, savininkasContext } from './support/savininkas';

// The admin's people screens (slice 14, #31) as the seeded superadmin
// (signed in by predictions.spec.ts's session, which this file sorts after,
// or by a mailed code when run alone). At a desktop width, with a newcomer
// of this run as the account the admin works on: the newcomer owns a league
// and invites the admin; the admin changes the newcomer's role with the code
// Mailpit received (a wrong one first), hides and shows them, marks a seeded
// member a guest and back, adds a message to the seeded league and deletes it
// with a code, deletes the newcomer (a code again) and sees the league
// handed over to the admin, and reads the audit, filtered. At a phone width
// the same screens without the codes (the admin is allowed five a ten
// minutes and structure.spec.ts has used two): hide, guest, a message added
// and edited, the audit filtered, no page scrolling sideways.

const MAILPIT = process.env['E2E_MAILPIT_URL'] ?? '';

test.describe.configure({ mode: 'serial' });

const DESKTOP = { width: 1280, height: 800, ip: '192.0.2.101' } as const;
const PHONE = { width: 390, height: 844, ip: '192.0.2.102' } as const;

const SEEDED_LEAGUE = 'Draugų lyga';
const TOURNAMENT = 'Euroleague 2026/27';
/** Where a newcomer plays: the newest tournament taking players (R-27, R-128). */
const NEWCOMERS_TOURNAMENT = 'Euroleague 2028/29';
const NEWCOMERS_FORM = '/tournament/euroleague-2028-29/register';

const said = (page: Page, text: string | RegExp) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();

const refused = (page: Page, text: string | RegExp) =>
  expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();

const userRow = (page: Page, username: string): Locator =>
  page.getByTestId('user-row').filter({ hasText: username });

/** The admin works on `tournament` ("▶ Kontekstas"): structure.spec.ts left another chosen. */
async function work(page: Page, tournament = TOURNAMENT): Promise<void> {
  await page.goto('/admin/tournaments');
  await page
    .getByTestId('tournament-row')
    .filter({ hasText: tournament })
    .getByRole('button', { name: '▶ Kontekstas' })
    .click();
  await expect(page).toHaveURL('/admin/index');
  await said(page, `Turnyro kontekstas: ${tournament}`);
}

/** The code just mailed to the admin, after `before` earlier ones. */
async function newCode(before: number): Promise<string> {
  const code = (await waitForCodes(MAILPIT, SAVININKAS.email, before + 1)).at(
    -1,
  );
  if (code === undefined) throw new Error('no code was mailed');
  return code;
}

/** The confirmation page: a wrong code first (it keeps the box), then the right one. */
async function confirmWithCode(
  page: Page,
  description: string | RegExp,
  before: number,
): Promise<void> {
  await expect(page).toHaveURL('/admin/confirm');
  await expect(page.getByTestId('confirm-action')).toHaveText(description);
  const code = await newCode(before);
  await page
    .getByLabel('8 skaitmenų kodas')
    .fill(code === '00000000' ? '11111111' : '00000000');
  await page.getByRole('button', { name: 'Patvirtinti' }).click();
  await expect(page).toHaveURL('/admin/confirm');
  await refused(page, 'Neteisingas arba pasibaigęs kodas.');
  await page.getByLabel('8 skaitmenų kodas').fill(code);
  await page.getByRole('button', { name: 'Patvirtinti' }).click();
}

const codesSoFar = async (): Promise<number> =>
  (await codesTo(MAILPIT, SAVININKAS.email)).length;

/** A browser context signed in as the seeded admin, at `size`. */
const adminContext = (
  browser: Browser,
  size: typeof DESKTOP | typeof PHONE,
): Promise<BrowserContext> =>
  savininkasContext(
    browser,
    { width: size.width, height: size.height },
    size.ip,
  );

/**
 * The admin joins the newcomers' tournament, so that a league there can find
 * them (R-88), and afterwards plays Euroleague 2026/27 again, as every other
 * journey expects.
 */
async function joinsNewcomersTournament(admin: Page): Promise<void> {
  await admin.goto(NEWCOMERS_FORM);
  await admin
    .getByRole('checkbox', {
      name: 'Patvirtinu, kad noriu dalyvauti šiame turnyre.',
    })
    .check();
  await admin.getByRole('button', { name: 'Registruotis į turnyrą' }).click();
  await expect(admin).toHaveURL('/main');
}

async function playsSeededTournamentAgain(admin: Page): Promise<void> {
  await admin.goto('/');
  await admin
    .getByTestId('hub-group-active')
    .getByRole('button', { name: 'Žaisti →' })
    .click();
  await expect(admin).toHaveURL('/main');
}

/** The newcomer creates a league and invites the admin, who accepts. */
async function ownsLeagueWithAdmin(
  owner: Page,
  admin: Page,
  league: string,
): Promise<void> {
  await joinsNewcomersTournament(admin);
  await owner.goto('/leagues');
  await owner.getByRole('button', { name: 'Sukurti lygą' }).click();
  const create = owner.getByRole('dialog', { name: 'Sukurti naują lygą' });
  await create.getByLabel('Pavadinimas').fill(league);
  await create.getByRole('button', { name: 'Sukurti', exact: true }).click();
  await said(owner, 'Lyga sukurta');
  await owner
    .getByTestId('league-row')
    .filter({ hasText: league })
    .getByTitle('Pakviesti narį')
    .click();
  const invite = owner.getByRole('dialog', { name: 'Pakviesti narį' });
  await invite.getByLabel('Ieškoti vartotojo...').fill('savininkas');
  await invite.getByRole('button', { name: /savininkas/u }).click();
  await said(owner, 'Kvietimas išsiųstas');
  await admin.goto('/leagues');
  await admin
    .getByTestId('invite-row')
    .filter({ hasText: league })
    .getByRole('button', { name: 'Priimti' })
    .click();
  await said(admin, 'Prisijungta prie lygos');
  await playsSeededTournamentAgain(admin);
}

/** The seeded league's members list, with `username`'s guest switch pressed and pressed back. */
async function markGuestAndBack(page: Page, username: string): Promise<void> {
  await page.goto('/admin/leagues');
  await page
    .getByTestId('league-row')
    .filter({ hasText: SEEDED_LEAGUE })
    .getByRole('link', { name: 'Nariai' })
    .click();
  await expect(page).toHaveURL(/\/admin\/leagues\/\d+\/members$/);
  const row = page.getByTestId('member-row').filter({ hasText: username });
  const guest = row.getByRole('switch', { name: 'Svečias' });
  const was = await guest.getAttribute('aria-checked');
  await guest.click();
  await said(
    page,
    was === 'true'
      ? 'Narys pažymėtas pilnateisiu nariu.'
      : 'Narys pažymėtas svečiu.',
  );
  await expect(
    page
      .getByTestId('member-row')
      .filter({ hasText: username })
      .getByRole('switch', { name: 'Svečias' }),
  ).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
  await page
    .getByTestId('member-row')
    .filter({ hasText: username })
    .getByRole('switch', { name: 'Svečias' })
    .click();
  await said(
    page,
    was === 'true'
      ? 'Narys pažymėtas svečiu.'
      : 'Narys pažymėtas pilnateisiu nariu.',
  );
}

/** A message into the seeded league through the insert row; its row. */
async function addMessage(
  page: Page,
  text: string,
  active: boolean,
): Promise<Locator> {
  await page.goto('/admin/messages');
  const insert = page.getByTestId('message-insert');
  await insert.getByLabel('Nauja žinutė').fill(text);
  await insert.getByLabel('Lyga').selectOption({ label: SEEDED_LEAGUE });
  if (active) await insert.getByRole('switch', { name: 'Aktyvi' }).check();
  await insert.getByRole('button', { name: 'Pridėti žinutę' }).click();
  await said(page, 'Žinutė pridėta.');
  const row = page
    .getByTestId('message-row')
    .filter({ has: page.locator(`input[value="${text}"]`) });
  await expect(row).toBeVisible();
  return row;
}

/** The audit's user select picks `username`: the address names the account and every row is theirs. */
async function filterAuditBy(page: Page, username: string): Promise<void> {
  await page.goto('/admin/audit');
  await page.getByLabel('Vartotojas').selectOption({ label: username });
  await expect(page).toHaveURL(/\/admin\/audit\?tab=prisijungimai&user=\d+/);
  const rows = page.getByTestId('audit-row');
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allTextContents()) {
    expect(text.startsWith(username)).toBe(true);
  }
  await page.getByRole('link', { name: 'Visi vartotojai' }).click();
  await expect(page).toHaveURL('/admin/audit');
}

/** Every people page fits the screen. */
async function fitsEveryPage(page: Page): Promise<void> {
  for (const path of [
    '/admin/users',
    '/admin/leagues',
    '/admin/messages',
    '/admin/audit',
    '/admin/audit?tab=roles',
  ]) {
    await page.goto(path);
    expect(await scrollsSideways(page)).toBe(false);
  }
}

test('manage people from the admin at a desktop width', async ({ browser }) => {
  // A registration, a league, three mailed codes and some two dozen pages.
  test.setTimeout(300_000);
  const suffix = String(Date.now());
  const who: Newcomer = newcomer(DESKTOP.width);
  const league = `Admin lyga ${suffix}`;
  const message = `E2E žinutė ${suffix}`;
  const adminContextDesktop = await adminContext(browser, DESKTOP);
  const admin = await adminContextDesktop.newPage();
  const ownerPage = await registered(browser, who, '192.0.2.103', DESKTOP);

  await ownsLeagueWithAdmin(ownerPage, admin, league);
  // The newcomer plays 2028/29, where an admin hides them: the context is
  // there until the seeded league's steps.
  await work(admin, NEWCOMERS_TOURNAMENT);

  // The index lists the four people tiles.
  for (const tile of ['Vartotojai', 'Lygos', 'Žinutės', 'Auditas']) {
    await expect(
      admin.getByRole('main').getByRole('link', { name: tile, exact: true }),
    ).toBeVisible();
  }
  await admin
    .getByRole('main')
    .getByRole('link', { name: 'Vartotojai', exact: true })
    .click();
  await expect(admin).toHaveURL('/admin/users');
  await expect(userRow(admin, who.username)).toBeVisible();
  // Nobody changes their own role or deletes themselves.
  await expect(admin.getByLabel('Rolė: savininkas')).toBeDisabled();
  await expect(
    userRow(admin, 'savininkas').getByRole('button', { name: 'Ištrinti' }),
  ).toHaveCount(0);

  // A role change asks for the emailed code: a wrong one, then the right one.
  let before = await codesSoFar();
  await admin
    .getByLabel(`Rolė: ${who.username}`)
    .selectOption('results-manager');
  await confirmWithCode(
    admin,
    `Pakeisti ${who.username} rolę: Žaidėjas -> Rezultatų tvarkytojas`,
    before,
  );
  await expect(admin).toHaveURL('/admin/users');
  await said(admin, `Vartotojo ${who.username} duomenys buvo atnaujinti.`);
  await expect(admin.getByLabel(`Rolė: ${who.username}`)).toHaveValue(
    'results-manager',
  );

  // Hide and show: the badge and the button follow.
  await userRow(admin, who.username)
    .getByRole('button', { name: 'Deaktyvuoti vartotoją' })
    .click();
  await said(admin, `Vartotojas ${who.username} paslėptas nuo lentelių.`);
  await expect(userRow(admin, who.username)).toContainText('neaktyvus');
  await userRow(admin, who.username)
    .getByRole('button', { name: 'Aktyvuoti vartotoją' })
    .click();
  await said(admin, `Vartotojas ${who.username} vėl rodomas lentelėse.`);
  await expect(userRow(admin, who.username)).not.toContainText('neaktyvus');

  // A seeded member marked a guest, and back.
  await work(admin);
  await markGuestAndBack(admin, 'zaidejas');

  // A message into the seeded league, then deleted with a code.
  const row = await addMessage(admin, message, true);
  const id = (await row.getByTestId('message-id').textContent()) ?? '';
  before = await codesSoFar();
  admin.once('dialog', (dialog) => void dialog.accept());
  await row.getByRole('button', { name: 'Ištrinti' }).click();
  await confirmWithCode(admin, /^Ištrinti žinutę #\d+$/, before);
  await expect(admin).toHaveURL('/admin/messages');
  await said(admin, `Žinutė #${id} ištrinta.`);
  await expect(admin.locator(`input[value="${message}"]`)).toHaveCount(0);

  // The newcomer's account goes with a code; the league they owned is the admin's.
  await admin.goto('/admin/users');
  before = await codesSoFar();
  admin.once('dialog', (dialog) => void dialog.accept());
  await userRow(admin, who.username)
    .getByRole('button', { name: 'Ištrinti' })
    .click();
  await confirmWithCode(
    admin,
    new RegExp(`^Ištrinti paskyrą ${who.username} \\(.+\\)$`),
    before,
  );
  await expect(admin).toHaveURL('/admin/users');
  await said(admin, `Vartotojas ${who.username} ištrintas.`);
  await expect(userRow(admin, who.username)).toHaveCount(0);
  await work(admin, NEWCOMERS_TOURNAMENT);
  await admin.goto('/admin/leagues');
  const handed = admin.getByTestId('league-row').filter({ hasText: league });
  await expect(handed).toBeVisible();
  await expect(handed.getByTestId('league-meta')).toContainText(
    ' · savininkas',
  );

  // The audit reads the role change and the deletion, and filters by a user.
  await admin.goto('/admin/audit?tab=roles');
  await expect(
    admin
      .getByTestId('audit-row')
      .filter({ hasText: 'Rolės keitimas' })
      .first(),
  ).toContainText('Rezultatų tvarkytojas');
  await expect(
    admin
      .getByTestId('audit-row')
      .filter({ hasText: 'Paskyros ištrynimas' })
      .first(),
  ).toBeVisible();
  await filterAuditBy(admin, 'savininkas');

  // The message shows once, and no page of it scrolls sideways.
  await admin.goto('/admin/users');
  await expect(admin.getByRole('status')).toHaveCount(0);
  await fitsEveryPage(admin);
  await ownerPage.context().close();
  await adminContextDesktop.close();
});

test('manage people from the admin at a phone width', async ({ browser }) => {
  test.setTimeout(240_000);
  const suffix = String(Date.now());
  const message = `Telefono žinutė ${suffix}`;
  const edited = `Pakeista ${suffix}`;
  const context = await adminContext(browser, PHONE);
  const page = await context.newPage();
  await work(page);

  // Hide and show a seeded player.
  await page.goto('/admin/users');
  await userRow(page, 'zaidejas')
    .getByRole('button', { name: 'Deaktyvuoti vartotoją' })
    .click();
  await said(page, 'Vartotojas zaidejas paslėptas nuo lentelių.');
  await userRow(page, 'zaidejas')
    .getByRole('button', { name: 'Aktyvuoti vartotoją' })
    .click();
  await said(page, 'Vartotojas zaidejas vėl rodomas lentelėse.');

  // The seeded guest made a full member, and back.
  await markGuestAndBack(page, 'svecias');

  // A message added and edited (a deletion needs a code, which the desktop journey spends).
  const row = await addMessage(page, message, false);
  await row.getByLabel(/^Žinutė #\d+$/).fill(edited);
  await row.getByRole('button', { name: 'Išsaugoti' }).click();
  await said(page, /^Žinutė #\d+ atnaujinta\.$/);
  await expect(page.locator(`input[value="${edited}"]`)).toBeVisible();

  await filterAuditBy(page, 'savininkas');
  await fitsEveryPage(page);
  await page.goto('/admin/leagues');
  await page
    .getByTestId('league-row')
    .filter({ hasText: SEEDED_LEAGUE })
    .getByRole('button', { name: 'Redaguoti' })
    .click();
  const dialog = page.getByRole('dialog', { name: SEEDED_LEAGUE });
  const box = await dialog.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(PHONE.width);
  await context.close();
});

test('a fetch that carries the one-time message does not consume it', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await adminContext(browser, PHONE);
  const page = await context.newPage();
  await work(page);
  await page.goto('/admin/users');
  const userID = await userRow(page, 'zaidejas')
    .locator('input[name="userID"]')
    .first()
    .inputValue();

  // The 303 leaves the message; then, before the page load that follows it,
  // a script's fetch (what Next's router prefetch from the outgoing page is)
  // reaches the server with the same cookie.
  await page.evaluate(async (id) => {
    await fetch('/admin/toggleHidden', {
      method: 'POST',
      body: new URLSearchParams({ userID: id }),
      redirect: 'manual',
    });
    await fetch('/admin/users', { headers: { rsc: '1' } });
  }, userID);

  await page.goto('/admin/users');
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Vartotojas zaidejas paslėptas nuo lentelių.' }),
  ).toBeVisible();
  await userRow(page, 'zaidejas')
    .getByRole('button', { name: 'Aktyvuoti vartotoją' })
    .click();
  await said(page, 'Vartotojas zaidejas vėl rodomas lentelėse.');
  await context.close();
});
