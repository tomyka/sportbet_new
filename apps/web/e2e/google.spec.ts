import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  answerCookies,
  newcomer,
  registered,
  scrollsSideways,
} from './support/newcomer';

// Google sign-in (slice 19, #40) against the E2E stack's fixture provider
// (GOOGLE_PROVIDER=fixture, infra/compose/e2e.yml): a new visitor registers
// through the button and lands on /main; the same identity signs in again;
// an account made by a mailed code is linked by its address; an unverified
// identity lands on / with sportbet's text; the login pane has the button and
// the register tab has none. At a phone and a desktop width, each with
// people of its own (the stack's database lives for the whole run).

const WIDTHS = [
  { name: 'phone', width: 390, height: 844, ip: '192.0.2.141' },
  { name: 'desktop', width: 1280, height: 800, ip: '192.0.2.142' },
] as const;

type Width = (typeof WIDTHS)[number];

/** What the fixture's page is told: who Google says is signing in. */
interface Person {
  readonly sub: string;
  readonly email: string;
  readonly verified: 'true' | 'false' | 'missing';
  readonly name: string;
}

/** A person of this run and width: a sub and an address no other test uses. */
function person(width: Width, tag: string): Person {
  const stamp = `${String(width.width)}${tag}${String(Date.now())}`;
  return {
    sub: `9${stamp}`.slice(0, 40),
    email: `e2e.google.${stamp}@sportbet.test`,
    verified: 'true',
    name: 'Gabija Googlaitė',
  };
}

/** A guest's browser at this width, the cookie bar answered. */
async function guest(browser: Browser, width: Width): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: width.width, height: width.height },
    extraHTTPHeaders: { 'x-forwarded-for': width.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await answerCookies(page);
  return page;
}

/** /login opens the dialog on the tournaments page. */
async function openDialog(page: Page) {
  await page.goto('/login');
  const dialog = page.getByRole('dialog', { name: 'Prisijungti' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The button, then the fixture's consent page with `who` typed in. */
async function viaGoogle(page: Page, who: Person): Promise<void> {
  const dialog = await openDialog(page);
  await dialog.getByRole('link', { name: 'Prisijungti su Google' }).click();
  await expect(
    page.getByRole('heading', { name: /Fixture Google/ }),
  ).toBeVisible();
  await page.locator('input[name="sub"]').fill(who.sub);
  await page.locator('input[name="email"]').fill(who.email);
  await page.locator('select[name="verified"]').selectOption(who.verified);
  await page.locator('input[name="name"]').fill(who.name);
  await page.getByRole('button', { name: /Continue as this person/ }).click();
}

/** The profile's username, for the account the browser is signed in as. */
async function usernameOf(page: Page): Promise<string> {
  await page.goto('/userProfile');
  return page.getByLabel('Vartotojo vardas').inputValue();
}

async function signOut(page: Page, width: Width): Promise<void> {
  if (width.width < 992) {
    const bar = page.getByTestId('phone-header');
    await bar.getByRole('button', { name: 'Atidaryti meniu' }).click();
    await bar.getByRole('button', { name: 'Atsijungti' }).click();
    await expect(bar.getByRole('link', { name: 'Prisijungti' })).toBeVisible();
  } else {
    const rail = page.getByTestId('rail');
    await rail.getByRole('button', { name: 'Atsijungti' }).click();
    await expect(rail.getByRole('link', { name: 'Prisijungti' })).toBeVisible();
  }
}

for (const width of WIDTHS) {
  test.describe(`at a ${width.name} width`, () => {
    test.describe.configure({ mode: 'serial' });

    test('a new visitor registers through the button and lands on the game page; the same person signs in again, to the same account', async ({
      browser,
    }) => {
      const who = person(width, 'a');
      const page = await guest(browser, width);
      await viaGoogle(page, who);
      await expect(page).toHaveURL('/main');
      const username = await usernameOf(page);
      expect(username).toBe(who.email.split('@')[0]);
      await expect(page.getByLabel('Vardas', { exact: true })).toHaveValue(
        'Gabija',
      );
      await expect(page.getByLabel('Pavardė')).toHaveValue('Googlaitė');
      expect(await scrollsSideways(page)).toBe(false);

      await signOut(page, width);
      await viaGoogle(page, who);
      await expect(page).toHaveURL('/main');
      expect(await usernameOf(page)).toBe(username);
      await page.context().close();
    });

    test('an account made by a mailed code is linked by its address, and Google signs in to it', async ({
      browser,
    }) => {
      const maker = newcomer(width.width);
      const made = await registered(browser, maker, '192.0.2.143', {
        width: width.width,
        height: width.height,
      });
      await signOut(made, width);
      const who: Person = {
        ...person(width, 'b'),
        email: maker.email,
        name: 'Kita Vardas',
      };
      await viaGoogle(made, who);
      await expect(made).toHaveURL('/main');
      expect(await usernameOf(made)).toBe(maker.username);
      // Google never rewrites the name of an account that exists.
      await expect(made.getByLabel('Vardas', { exact: true })).toHaveValue(
        maker.name,
      );
      await made.context().close();
    });

    test('an unverified address lands on the start page with the text, signed in as nobody', async ({
      browser,
    }) => {
      const page = await guest(browser, width);
      await viaGoogle(page, { ...person(width, 'c'), verified: 'false' });
      await expect(page).toHaveURL('/');
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'Google paskyros el. paštas nepatvirtintas.' }),
      ).toBeVisible();
      // The message shows once, and nobody is signed in.
      await page.reload();
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'Google paskyros el. paštas nepatvirtintas.' }),
      ).toHaveCount(0);
      await page.goto('/main');
      await expect(page).not.toHaveURL('/main');
      await page.context().close();
    });

    test('a claim that is missing counts as unverified too', async ({
      browser,
    }) => {
      const page = await guest(browser, width);
      await viaGoogle(page, { ...person(width, 'd'), verified: 'missing' });
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'Google paskyros el. paštas nepatvirtintas.' }),
      ).toBeVisible();
      await page.context().close();
    });

    test('the login pane has the button and the register tab has none', async ({
      browser,
    }) => {
      const page = await guest(browser, width);
      const dialog = await openDialog(page);
      await expect(
        dialog.getByRole('link', { name: 'Prisijungti su Google' }),
      ).toBeVisible();
      await dialog.getByRole('tab', { name: 'Registruotis' }).click();
      await expect(
        dialog.getByRole('link', { name: 'Prisijungti su Google' }),
      ).toBeHidden();
      await page.context().close();
    });
  });
}
