import { expect, test, type Page } from '@playwright/test';
import {
  newcomer,
  registered,
  scrollsSideways,
  type Newcomer,
} from './support/newcomer';

// Managing leagues (slice 12b, #29) as two newcomers of this run, who both
// play Euroleague 2028/29 when they register (R-27, R-128): the owner creates a
// league, finds the invitee by an accent-free fragment of the name and
// invites; the invitee sees the badge, accepts, and the badge goes; the
// owner hands the league over and leaves; the new owner renames it, selects
// it and deletes it, which puts their selection back in the public league.
// Then the page at a phone width. A player who plays nothing cannot be made
// through the UI (registering joins), so the search's R-88 half is the
// feature tests'. Each newcomer has an address of their own for sportbet's
// 3 registrations a minute per IP, and the league's name a suffix of this run.

test.describe.configure({ mode: 'serial' });

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

const rowOf = (page: Page, name: string) =>
  page.getByTestId('league-row').filter({ hasText: name });

const said = (page: Page, text: string) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();

test('create, invite by an accent-free search, accept, hand over, leave, rename, switch and delete; then the phone width', async ({
  browser,
}) => {
  // Two registrations through Mailpit and a dozen pages.
  test.setTimeout(240_000);
  const suffix = String(Date.now());
  const league = `Lyga ${suffix}`;
  const renamed = `Pervadinta ${suffix}`;
  const owner = newcomer(1280);
  const invitee: Newcomer = {
    ...newcomer(1281),
    name: 'Šarūnas',
    surname: 'Jasikevičius',
  };

  const ownerPage = await registered(browser, owner, '192.0.2.81', DESKTOP);
  const inviteePage = await registered(browser, invitee, '192.0.2.82', DESKTOP);

  // The owner opens the page from the rail and creates the league.
  const ownerRail = ownerPage.getByTestId('rail');
  await ownerPage.goto('/main');
  await ownerRail.getByRole('link', { name: 'Lygos' }).click();
  await expect(ownerPage).toHaveURL('/leagues');
  await expect(ownerPage.getByText('Mano lygos')).toBeVisible();
  await ownerPage.getByRole('button', { name: 'Sukurti lygą' }).click();
  const create = ownerPage.getByRole('dialog', { name: 'Sukurti naują lygą' });
  await create.getByLabel('Pavadinimas').fill(league);
  await create.getByLabel('Aprašymas').fill('Bandomoji lyga');
  await create.getByRole('button', { name: 'Sukurti', exact: true }).click();
  await expect(ownerPage).toHaveURL('/leagues');
  await said(ownerPage, 'Lyga sukurta');
  await expect(rowOf(ownerPage, league)).toContainText('Savininkas');
  await expect(rowOf(ownerPage, league)).toContainText('Bandomoji lyga');
  // The message shows once.
  await ownerPage.reload();
  await expect(ownerPage.getByRole('status')).toHaveCount(0);

  // The invitee has nothing waiting yet.
  const inviteeRail = inviteePage.getByTestId('rail');
  await inviteePage.goto('/leagues');
  await expect(inviteeRail.locator('[data-missing="invites"]')).toBeHidden();
  await expect(inviteePage.getByText('Kvietimai', { exact: true })).toHaveCount(
    0,
  );

  // The owner searches by "sarun" (Šarūnas), picks the invitee, and is told.
  await rowOf(ownerPage, league).getByTitle('Pakviesti narį').click();
  const invite = ownerPage.getByRole('dialog', { name: 'Pakviesti narį' });
  await expect(invite.getByText('Nariai')).toBeVisible();
  await invite.getByLabel('Ieškoti vartotojo...').fill('sarun');
  await invite
    .getByRole('button', { name: new RegExp(invitee.username, 'u') })
    .click();
  await expect(ownerPage).toHaveURL('/leagues');
  await said(ownerPage, 'Kvietimas išsiųstas');

  // The invitee's rail counts it; the page lists it, and accepting clears both.
  await inviteePage.goto('/leagues');
  await expect(inviteeRail.locator('[data-missing="invites"]')).toBeVisible();
  await expect(inviteeRail.locator('[data-invites]')).toHaveText('1');
  const invitation = inviteePage
    .getByTestId('invite-row')
    .filter({ hasText: league });
  await expect(invitation).toContainText(`pakvietė ${owner.username}`);
  await invitation.getByRole('button', { name: 'Priimti' }).click();
  await said(inviteePage, 'Prisijungta prie lygos');
  await expect(inviteeRail.locator('[data-missing="invites"]')).toBeHidden();
  await expect(inviteeRail.locator('[data-invites]')).toHaveCount(0);
  await expect(rowOf(inviteePage, league)).toContainText('Narys');
  // A plain member has no invite, edit or hand-over, and may leave.
  await expect(
    rowOf(inviteePage, league).getByTitle('Palikti lygą'),
  ).toBeVisible();
  await expect(
    rowOf(inviteePage, league).getByTitle('Redaguoti lygą'),
  ).toHaveCount(0);

  // The owner hands the league over to the invitee.
  await ownerPage.goto('/leagues');
  await rowOf(ownerPage, league).getByTitle('Perduoti valdymą').click();
  const handOver = ownerPage.getByRole('dialog', { name: 'Perduoti valdymą' });
  await handOver
    .getByRole('combobox', { name: 'Narys' })
    .selectOption({ index: 0 });
  await handOver.getByRole('button', { name: 'Perduoti valdymą' }).click();
  await expect(ownerPage).toHaveURL('/leagues');
  await said(ownerPage, 'Lygos valdymas perduotas');
  await expect(rowOf(ownerPage, league)).toContainText('Narys');
  await expect(
    rowOf(ownerPage, league).getByTitle('Redaguoti lygą'),
  ).toBeVisible();

  // The former owner may now leave.
  ownerPage.once('dialog', (dialog) => void dialog.accept());
  await rowOf(ownerPage, league).getByTitle('Palikti lygą').click();
  await said(ownerPage, 'Palikote lygą');
  await expect(rowOf(ownerPage, league)).toHaveCount(0);

  // The new owner sees it as theirs and renames it.
  await inviteePage.goto('/leagues');
  await expect(rowOf(inviteePage, league)).toContainText('Savininkas');
  await rowOf(inviteePage, league).getByTitle('Redaguoti lygą').click();
  const edit = inviteePage.getByRole('dialog', { name: league });
  await edit.getByLabel('Pavadinimas').fill(renamed);
  await edit.getByRole('button', { name: 'Išsaugoti' }).click();
  await said(inviteePage, 'Lyga atnaujinta');
  await expect(rowOf(inviteePage, renamed)).toBeVisible();

  // Selected, then deleted: the selection falls back to the public league.
  await rowOf(inviteePage, renamed).getByTitle('Perjungti į šią lygą').click();
  await said(inviteePage, 'Lyga pakeista');
  await expect(rowOf(inviteePage, renamed)).toHaveAttribute(
    'data-selected',
    'true',
  );
  await rowOf(inviteePage, renamed).getByTitle('Redaguoti lygą').click();
  const doomed = inviteePage.getByRole('dialog', { name: renamed });
  inviteePage.once('dialog', (dialog) => void dialog.accept());
  await doomed.getByRole('button', { name: 'Ištrinti lygą' }).click();
  await said(inviteePage, 'Lyga ištrinta');
  await expect(rowOf(inviteePage, renamed)).toHaveCount(0);
  await expect(
    inviteePage.locator('[data-testid="league-row"][data-selected="true"]'),
  ).toHaveCount(1);

  // The phone width: the page and its dialog fit, and the menu offers "Tvarkyti lygą".
  await inviteePage.setViewportSize(PHONE);
  await inviteePage.goto('/leagues');
  expect(await scrollsSideways(inviteePage)).toBe(false);
  await inviteePage.getByRole('button', { name: 'Atidaryti meniu' }).click();
  await expect(
    inviteePage
      .getByTestId('phone-header')
      .getByRole('link', { name: 'Tvarkyti lygą' }),
  ).toBeVisible();
  await inviteePage.getByRole('button', { name: 'Atidaryti meniu' }).click();
  await inviteePage.getByRole('button', { name: 'Sukurti lygą' }).click();
  const phoneDialog = inviteePage.getByRole('dialog', {
    name: 'Sukurti naują lygą',
  });
  await expect(phoneDialog).toBeVisible();
  const box = await phoneDialog.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(PHONE.width);
  expect(await scrollsSideways(inviteePage)).toBe(false);
  await inviteePage.keyboard.press('Escape');
  await expect(phoneDialog).toBeHidden();

  await ownerPage.context().close();
  await inviteePage.context().close();
});
