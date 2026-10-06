import { expect, type Page } from '@playwright/test';
import { codesTo, waitForCodes } from '../../tests/support/mailpit';

// A newcomer of this run: registration from the dialog (spec 4c, issue
// #18), shared by register.spec.ts and join.spec.ts. The stack's database
// lives for the whole run: each newcomer has an address and a username no
// other test uses.

const MAILPIT = process.env['E2E_MAILPIT_URL'] ?? '';

/** The cookie bar sits over the page's foot; the visitor answers it first. */
export async function answerCookies(page: Page): Promise<void> {
  await page
    .getByTestId('cookie-consent')
    .getByRole('button', { name: 'Tik būtini' })
    .click();
}

export interface Newcomer {
  readonly username: string;
  readonly name: string;
  readonly surname: string;
  readonly email: string;
}

/** A newcomer of this run, at this width. */
export function newcomer(width: number): Newcomer {
  const tag = `${String(width)}x${String(Date.now())}`;
  return {
    username: `naujoke${tag}`,
    name: 'Rūta',
    surname: 'Naujokė',
    email: `e2e.naujoke.${tag}@sportbet.test`,
  };
}

/** From an open dialog to a signed-in page: the Registruotis tab, the answers, the mailed code. */
export async function register(page: Page, who: Newcomer): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Prisijungti' });
  await expect(dialog).toBeVisible();
  const tab = dialog.getByRole('tab', { name: 'Registruotis' });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const form = dialog.getByTestId('register-request');
  await form
    .getByPlaceholder('Slapyvardis', { exact: true })
    .fill(who.username);
  await form.getByPlaceholder('Vardas', { exact: true }).fill(who.name);
  await form.getByPlaceholder('Pavardė', { exact: true }).fill(who.surname);
  await form.getByPlaceholder('El. paštas', { exact: true }).fill(who.email);
  const before = (await codesTo(MAILPIT, who.email)).length;
  await form.getByRole('button', { name: 'Registruotis' }).click();
  await expect(dialog.getByText(who.email)).toBeVisible();
  const code = (await waitForCodes(MAILPIT, who.email, before + 1)).at(-1);
  if (code === undefined) throw new Error('no code was mailed');
  await dialog.getByLabel('8 skaitmenų kodas').fill(code);
  await dialog.getByRole('button', { name: 'Užbaigti registraciją' }).click();
  await expect(dialog).toBeHidden();
}

/** From an open dialog to a signed-in page: a newcomer's address, the mailed code. */
export async function signIn(page: Page, who: Newcomer): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Prisijungti' });
  await expect(dialog).toBeVisible();
  const form = dialog.getByTestId('sign-in-request');
  await form.getByPlaceholder('El. paštas', { exact: true }).fill(who.email);
  const before = (await codesTo(MAILPIT, who.email)).length;
  await form.getByRole('button', { name: 'Gauti prisijungimo kodą' }).click();
  await expect(dialog.getByText(who.email)).toBeVisible();
  const code = (await waitForCodes(MAILPIT, who.email, before + 1)).at(-1);
  if (code === undefined) throw new Error('no code was mailed');
  await dialog.getByLabel('8 skaitmenų kodas').fill(code);
  await dialog
    .getByRole('button', { name: 'Prisijungti', exact: true })
    .click();
  await expect(dialog).toBeHidden();
}

/** sportbet's LayoutOverflowRegressionTest, in a browser: the page never scrolls sideways. */
export async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}
