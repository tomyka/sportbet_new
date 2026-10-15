import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  newcomer,
  registered,
  scrollsSideways,
  type Newcomer,
} from './support/newcomer';

// A league's money (slice 12c, #29) as two newcomers of this run, who both
// play Euroleague 2026/27 when they register (R-48): the owner creates a
// league with a fee of 20, invites the invitee, who accepts and selects it
// and sees the due line, and a pop-up that says nothing has been named yet.
// The owner opens "Mokėjimai", saves an IBAN that fails its checksum (told,
// nothing stored), then a valid one with their own name offered as the
// beneficiary; the invitee's pop-up now has the three rows, and a row's
// button copies. The owner types 20 for the invitee: "✓", the chip and the
// meter move; the invitee, back on the game page, sees the paid line and no
// account number, and the pots. The invitee asking for the payments page is
// sent home. Then the phone width. A league's guests and messages have no
// screen before slice 14, so they are the feature tests'. Each newcomer has
// an address of their own for sportbet's 3 registrations a minute per IP,
// and the league's name a suffix of this run.

test.describe.configure({ mode: 'serial' });

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

const IBAN_TYPED = 'LT12 1000 0111 0100 1000';

const said = (page: Page, text: string) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();

const rowOf = (page: Page, name: string) =>
  page.getByTestId('league-row').filter({ hasText: name });

/** The payments page's row of the member whose username is `username`. */
const memberRow = (page: Page, username: string) =>
  page.getByRole('row').filter({ hasText: username });

/** The "Kaip sumokėti" pop-up, opened. */
async function openHowToPay(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Kaip sumokėti' }).click();
  const popup = page.getByRole('dialog', { name: 'Dalyvio mokestis' });
  await expect(popup).toBeVisible();
  return popup;
}

/** Types an amount and leaves the box: the row posts itself and says "✓". */
async function typeAmount(row: Locator, amount: string): Promise<void> {
  const box = row.getByRole('textbox');
  await box.fill(amount);
  await box.press('Tab');
  await expect(row.getByRole('status')).toHaveText('✓');
}

test('the fee, where to pay it, a payment recorded and what the member sees; then the phone width', async ({
  browser,
}) => {
  // Two registrations through Mailpit and a dozen pages.
  test.setTimeout(240_000);
  const suffix = String(Date.now());
  const league = `Mokestis ${suffix}`;
  const owner = newcomer(1290);
  const invitee: Newcomer = {
    ...newcomer(1291),
    name: 'Šarūnas',
    surname: 'Jasikevičius',
  };
  const ownerName = `${owner.name} ${owner.surname}`;

  const ownerPage = await registered(browser, owner, '192.0.2.91', DESKTOP);
  const inviteePage = await registered(browser, invitee, '192.0.2.92', DESKTOP);
  await inviteePage
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write']);

  // The owner creates a league with a fee of 20 and invites the invitee.
  await ownerPage.goto('/leagues');
  await ownerPage.getByRole('button', { name: 'Sukurti lygą' }).click();
  const create = ownerPage.getByRole('dialog', { name: 'Sukurti naują lygą' });
  await create.getByLabel('Pavadinimas').fill(league);
  await create.getByLabel('Dalyvio mokestis (€)').fill('20');
  await create.getByRole('button', { name: 'Sukurti', exact: true }).click();
  await said(ownerPage, 'Lyga sukurta');
  await rowOf(ownerPage, league).getByTitle('Pakviesti narį').click();
  const invite = ownerPage.getByRole('dialog', { name: 'Pakviesti narį' });
  await invite.getByLabel('Ieškoti vartotojo...').fill('sarun');
  await invite
    .getByRole('button', { name: new RegExp(invitee.username, 'u') })
    .click();
  await said(ownerPage, 'Kvietimas išsiųstas');

  // The invitee accepts, selects the league, and on the game page owes 20.
  await inviteePage.goto('/leagues');
  await inviteePage
    .getByTestId('invite-row')
    .filter({ hasText: league })
    .getByRole('button', { name: 'Priimti' })
    .click();
  await said(inviteePage, 'Prisijungta prie lygos');
  await rowOf(inviteePage, league).getByTitle('Perjungti į šią lygą').click();
  await said(inviteePage, 'Lyga pakeista');
  await inviteePage.goto('/main');
  await expect(
    inviteePage.getByText('Dalyvio mokestis 20,00 € dar nesumokėtas.'),
  ).toBeVisible();
  await expect(
    inviteePage.getByText(
      'Dalyvių skaičius: 2, prognozuojama suma: 40.00€, surinkta suma: 0.00€',
    ),
  ).toBeVisible();
  const nothingNamed = await openHowToPay(inviteePage);
  await expect(nothingNamed.getByText('Mokėti', { exact: true })).toBeVisible();
  await expect(nothingNamed.getByText('20,00 €')).toBeVisible();
  await expect(
    nothingNamed.getByText(/Mokėjimo rekvizitų administratorius dar nenurodė/u),
  ).toBeVisible();
  await expect(
    nothingNamed.getByRole('button', { name: /Kopijuoti/u }),
  ).toHaveCount(0);
  await nothingNamed.getByRole('button', { name: 'Uždaryti' }).last().click();
  await expect(nothingNamed).toBeHidden();

  // The owner follows "Mokėjimai" from the league's card.
  await ownerPage.goto('/leagues');
  await rowOf(ownerPage, league).getByTitle('Mokėjimai').click();
  await expect(ownerPage).toHaveURL(/\/leagues\/\d+\/payments$/u);
  const paymentsUrl = ownerPage.url();
  await expect(ownerPage.getByText(`Mokėjimai · ${league}`)).toBeVisible();
  await expect(ownerPage.getByText('Sumokėjo 0 iš 2')).toBeVisible();
  await expect(ownerPage.getByTestId('expected')).toHaveText('40.00€');

  // An IBAN that fails its checksum is refused and nothing is stored.
  await expect(ownerPage.getByLabel('Gavėjas')).toHaveValue(ownerName);
  await ownerPage.getByLabel('Sąskaita (IBAN)').fill('LT121000011101001080');
  await ownerPage.getByRole('button', { name: 'Išsaugoti' }).click();
  await expect(
    ownerPage
      .getByRole('alert')
      .filter({ hasText: 'Neteisingas IBAN - patikrinkite' }),
  ).toBeVisible();
  await expect(ownerPage.getByLabel('Sąskaita (IBAN)')).toHaveValue('');

  // A valid one is saved, shown in fours, with the owner's name as the beneficiary.
  await ownerPage.getByLabel('Sąskaita (IBAN)').fill('lt121000011101001000');
  await ownerPage.getByRole('button', { name: 'Išsaugoti' }).click();
  await said(ownerPage, 'Rekvizitai išsaugoti');
  await expect(ownerPage.getByLabel('Sąskaita (IBAN)')).toHaveValue(IBAN_TYPED);
  await expect(ownerPage.getByLabel('Gavėjas')).toHaveValue(ownerName);

  // The invitee's pop-up now has the three rows, and a button copies.
  await inviteePage.reload();
  const rows = await openHowToPay(inviteePage);
  await expect(rows.getByText(ownerName)).toBeVisible();
  await expect(rows.getByText(IBAN_TYPED)).toBeVisible();
  await expect(rows.getByText('Jaunimo linijai')).toBeVisible();
  await expect(
    rows.getByText(
      'Mokėjimo paskirtį nurodykite tiksliai taip, kaip parašyta.',
    ),
  ).toBeVisible();
  await rows.getByRole('button', { name: 'Kopijuoti IBAN' }).click();
  await expect(
    rows.getByRole('button', { name: 'Kopijuoti IBAN' }),
  ).toHaveAttribute('data-done', 'true');
  expect(await inviteePage.evaluate(() => navigator.clipboard.readText())).toBe(
    IBAN_TYPED,
  );
  await rows.getByRole('button', { name: 'Uždaryti' }).last().click();

  // The owner records the payment: "✓", the chip and the meter move.
  const invitees = memberRow(ownerPage, invitee.username);
  await expect(invitees.getByText('Nesumokėta')).toBeVisible();
  await typeAmount(invitees, '20');
  await expect(invitees.getByText('Sumokėta', { exact: true })).toBeVisible();
  await expect(ownerPage.getByText('Sumokėjo 1 iš 2')).toBeVisible();
  await expect(ownerPage.getByTestId('collected')).toHaveText('20.00€');
  await expect(ownerPage.getByTestId('expected')).toHaveText('40.00€');
  // A reload shows what was stored.
  await ownerPage.reload();
  await expect(
    memberRow(ownerPage, invitee.username).getByRole('textbox'),
  ).toHaveValue('20');
  await expect(ownerPage.getByText('Sumokėjo 1 iš 2')).toBeVisible();

  // The invitee sees the paid line and the pots, and no account number.
  await inviteePage.goto('/main');
  await expect(
    inviteePage.getByText(
      'Startinis dalyvio mokestis sumokėtas. Sėkmės totalizatoriuje!',
    ),
  ).toBeVisible();
  await expect(
    inviteePage.getByText(
      'Dalyvių skaičius: 2, prognozuojama suma: 40.00€, surinkta suma: 20.00€',
    ),
  ).toBeVisible();
  await expect(inviteePage.getByText('nesumokėtas')).toHaveCount(0);
  await expect(
    inviteePage.getByRole('button', { name: 'Kaip sumokėti' }),
  ).toHaveCount(0);
  expect(await inviteePage.content()).not.toContain('LT12');

  // The invitee asking for the payments page is sent home.
  await inviteePage.goto(paymentsUrl);
  await expect(inviteePage).not.toHaveURL(/payments/u);
  await expect(inviteePage.getByText('Sumokėjo')).toHaveCount(0);

  // The phone width: the owner clears the amount, the invitee owes again.
  await ownerPage.setViewportSize(PHONE);
  await ownerPage.goto(paymentsUrl);
  expect(await scrollsSideways(ownerPage)).toBe(false);
  await typeAmount(memberRow(ownerPage, invitee.username), '');
  await expect(
    memberRow(ownerPage, invitee.username).getByText('Nesumokėta'),
  ).toBeVisible();
  await expect(ownerPage.getByText('Sumokėjo 0 iš 2')).toBeVisible();
  await expect(ownerPage.getByTestId('collected')).toHaveText('0.00€');
  expect(await scrollsSideways(ownerPage)).toBe(false);

  await inviteePage.setViewportSize(PHONE);
  await inviteePage.goto('/main');
  await expect(
    inviteePage.getByText('Dalyvio mokestis 20,00 € dar nesumokėtas.'),
  ).toBeVisible();
  expect(await scrollsSideways(inviteePage)).toBe(false);
  const phonePopup = await openHowToPay(inviteePage);
  const box = await phonePopup.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(PHONE.width);
  expect(await scrollsSideways(inviteePage)).toBe(false);
  await inviteePage.keyboard.press('Escape');
  await expect(phonePopup).toBeHidden();

  await ownerPage.context().close();
  await inviteePage.context().close();
});
