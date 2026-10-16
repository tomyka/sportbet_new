import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';
import { codesTo, mailsTo, waitForCodes } from '../tests/support/mailpit';
import {
  newcomer,
  registered,
  scrollsSideways,
  type Newcomer,
} from './support/newcomer';

// The profile (slice 17, #34) as a newcomer of this run - never the seeded
// account, which other specs sign in with and which this one deletes the
// way a player would: change the name; request an address change, read the
// code in Mailpit, confirm it (the old address is told); switch reminders on
// and off; choose the theme; ask for a deletion code, delete the account with
// it and land signed out on '/'. At a phone and a desktop width, each with
// a newcomer of its own.

const MAILPIT = process.env['E2E_MAILPIT_URL'] ?? '';

test.describe.configure({ mode: 'serial' });

const WIDTHS = [
  { name: 'phone', width: 390, height: 844, ip: '192.0.2.121' },
  { name: 'desktop', width: 1280, height: 800, ip: '192.0.2.122' },
] as const;

const said = (page: Page, text: string | RegExp) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();

const profileForm = (page: Page): Locator => page.getByTestId('profile-form');

/** The form's save button, which the notifications card also has. */
const save = (form: Locator) =>
  form.getByRole('button', { name: 'Išsaugoti' }).click();

/** The code Mailpit received for `address` after `before` earlier ones. */
async function newCode(address: string, before: number): Promise<string> {
  const code = (await waitForCodes(MAILPIT, address, before + 1)).at(-1);
  if (code === undefined) throw new Error('no code was mailed');
  return code;
}

async function rename(page: Page): Promise<void> {
  await page.goto('/userProfile');
  const form = profileForm(page);
  await form.getByLabel('Vardas', { exact: true }).fill('Rūtelė');
  await save(form);
  await said(page, 'Profilis atnaujintas.');
  await expect(page.getByText('Rūtelė Naujokė')).toBeVisible();
  // The message shows once.
  await page.reload();
  await expect(page.getByRole('status')).toHaveCount(0);
}

/** Asks for the new address, enters a wrong code, then the mailed one; the old address is told. */
async function changeAddress(
  page: Page,
  who: Newcomer,
  address: string,
): Promise<void> {
  const form = profileForm(page);
  await form.getByLabel('El. paštas').fill(address);
  await save(form);
  await said(page, `Patvirtinimo kodas išsiųstas į ${address}.`);
  const pending = page.getByTestId('pending-email');
  await expect(pending).toContainText(
    `Laukiama patvirtinimo adresui ${address}`,
  );
  const code = await newCode(address, 0);
  await pending.getByLabel('Patvirtinimo kodas').fill('00000000');
  await pending.getByRole('button', { name: 'Patvirtinti' }).click();
  await expect(
    page
      .getByTestId('pending-email')
      .getByRole('alert')
      .filter({ hasText: 'Neteisingas arba pasibaigęs patvirtinimo kodas.' }),
  ).toBeVisible();
  await pending.getByLabel('Patvirtinimo kodas').fill(code);
  await pending.getByRole('button', { name: 'Patvirtinti' }).click();
  await said(
    page,
    'El. paštas pakeistas. Apie pakeitimą pranešėme senuoju adresu.',
  );
  await expect(page.getByTestId('pending-email')).toHaveCount(0);
  await expect(profileForm(page).getByLabel('El. paštas')).toHaveValue(address);
  await expect
    .poll(async () => (await mailsTo(MAILPIT, who.email)).length)
    .toBeGreaterThan(0);
  const notices = await mailsTo(MAILPIT, who.email);
  const notice = notices.find(
    ({ subject }) => subject === 'Jūsų paskyros el. paštas pakeistas',
  );
  expect(notice?.html).toContain(address);
}

async function reminders(page: Page): Promise<void> {
  const box = page.getByLabel('Įjungti priminimus');
  await expect(box).not.toBeChecked();
  await box.check();
  await page.getByRole('button', { name: 'Išsaugoti' }).last().click();
  await said(page, 'Pranešimų nustatymai atnaujinti.');
  await expect(page.getByLabel('Įjungti priminimus')).toBeChecked();
  await page.getByLabel('Įjungti priminimus').uncheck();
  await page.getByRole('button', { name: 'Išsaugoti' }).last().click();
  await said(page, 'Pranešimų nustatymai atnaujinti.');
  await expect(page.getByLabel('Įjungti priminimus')).not.toBeChecked();
}

async function theme(page: Page): Promise<void> {
  const root = page.locator('html');
  await page.getByRole('button', { name: 'Tamsi' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  // Chosen for every later load, before the first paint.
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Tamsi' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Šviesi' }).click();
  await expect(root).not.toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(root).not.toHaveAttribute('data-theme', 'dark');
}

/** Ask for the code, delete with a wrong one first, then the mailed one: signed out on '/'. */
async function deleteAccount(page: Page, address: string): Promise<void> {
  const before = (await codesTo(MAILPIT, address)).length;
  await page.getByRole('button', { name: 'Ištrinti paskyrą' }).click();
  await page.getByRole('button', { name: /Siųsti patvirtinimo kodą/ }).click();
  await said(page, 'Patvirtinimo kodas išsiųstas į jūsų el. pašto adresą.');
  const zone = page.getByTestId('danger-zone');
  await expect(zone.getByLabel('Patvirtinimo kodas')).toBeVisible();
  const code = await newCode(address, before);
  await zone.getByLabel('Patvirtinimo kodas').fill('00000000');
  await zone
    .getByRole('button', { name: /Ištrinti paskyrą visam laikui/ })
    .click();
  await expect(
    page
      .getByTestId('danger-zone')
      .getByRole('alert')
      .filter({ hasText: 'Neteisingas arba pasibaigęs patvirtinimo kodas.' }),
  ).toBeVisible();
  await page
    .getByTestId('danger-zone')
    .getByLabel('Patvirtinimo kodas')
    .fill(code);
  await page
    .getByTestId('danger-zone')
    .getByRole('button', { name: /Ištrinti paskyrą visam laikui/ })
    .click();
  await expect(page).toHaveURL('/');
  // Signed out: the profile sends a guest to sign in.
  await page.goto('/userProfile');
  await expect(page.getByRole('dialog', { name: 'Prisijungti' })).toBeVisible();
}

async function context(browser: Browser, width: (typeof WIDTHS)[number]) {
  const who = newcomer(width.width);
  const page = await registered(browser, who, width.ip, {
    width: width.width,
    height: width.height,
  });
  return { who, page };
}

for (const width of WIDTHS) {
  test(`edit the profile, change the address, switch reminders and theme, and delete the account at a ${width.name} width`, async ({
    browser,
  }) => {
    // A dozen pages, two mailed codes and a deletion.
    test.setTimeout(240_000);
    const { who, page } = await context(browser, width);
    const address = `e2e.profile.${String(width.width)}x${String(Date.now())}@sportbet.test`;

    await rename(page);
    await changeAddress(page, who, address);
    await reminders(page);
    await theme(page);
    expect(await scrollsSideways(page)).toBe(false);
    await deleteAccount(page, address);
    await page.context().close();
  });
}
