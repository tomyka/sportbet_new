import { expect, test } from '@playwright/test';
import {
  answerCookies,
  newcomer,
  register,
  scrollsSideways,
  signIn,
} from './support/newcomer';
import { SAVININKAS_SESSION } from './support/savininkas';

// Predicting (slice 6, #20) as the seeded account (infra/compose/e2e.yml's
// STAGING_ACCOUNT_EMAIL), which the staging seed puts in Euroleague 2026/27
// with a blank row for game 9001 (Zalgiris Kaunas - Real Madrid, to come)
// and 9002 (Real Madrid - Zalgiris Kaunas, started). One sign-in for the
// whole journey: the address allows three codes in ten minutes and
// sign-in.spec.ts uses two (decision 10).

const PLAYER = {
  username: 'savininkas',
  name: 'Savininkas',
  surname: '',
  email: 'e2e.player@sportbet.test',
};

test.describe.configure({ mode: 'serial' });

test("from the mail's game link through sign-in, to the list, its autosave and odds, a locked game, the standings ladder, a survival pick and its summary, and the phone width", async ({
  page,
  browser,
}) => {
  // One journey across seven pages and two widths, with mailed sign-ins.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });

  // The cookie bar first: the sign-in dialog the link opens covers it.
  await page.goto('/');
  await answerCookies(page);

  // The reminder mail's link, signed out: sign in, and land back on it.
  await page.goto('/prediction/game/9001');
  await expect(page).toHaveURL('/');
  await signIn(page, PLAYER);
  // The seeded address is allowed three sign-in codes in ten minutes, and
  // the specs after this one (structure.spec.ts) need it signed in: they
  // reuse this session rather than ask for a fourth code.
  await page.context().storageState({ path: SAVININKAS_SESSION });
  await expect(page).toHaveURL('/prediction/game/9001');
  const form = page.getByTestId('single-game-form');
  await form.getByLabel('Zalgiris Kaunas').fill('88');
  await form.getByLabel('Real Madrid').fill('79');
  // R-62: saved as typed, like the list; the player stays on the page.
  await expect(form.getByLabel('Zalgiris Kaunas')).toHaveClass(/border-ok/);
  await expect(page).toHaveURL('/prediction/game/9001');

  // The list: the pair kept, the badge gone.
  const rail = page.getByTestId('rail');
  await rail.getByRole('link', { name: 'Spėjimai' }).click();
  await expect(page).toHaveURL('/prediction/results');
  const open = page.locator('[data-testid="prediction-row"][data-game="9001"]');
  await expect(open.getByLabel('Zalgiris Kaunas')).toHaveValue('88');
  await expect(open.getByLabel('Real Madrid')).toHaveValue('79');
  // Round 1's other open game (9004, slice 10's survival game) is
  // still unanswered, so the badge stays until it is answered too.
  await expect(rail.locator('[data-missing="results"]')).toBeVisible();
  const other = page.locator(
    '[data-testid="prediction-row"][data-game="9004"]',
  );
  await other.getByLabel('Fenerbahce').fill('80');
  await other.getByLabel('Anadolu Efes').fill('75');
  await expect(other.getByLabel('Anadolu Efes')).toHaveClass(/border-ok/);
  await expect(rail.locator('[data-missing="results"]')).toBeHidden();

  // Cleared: the badge is back.
  await open.getByLabel('Real Madrid').fill('');
  await open.getByLabel('Zalgiris Kaunas').fill('');
  await expect(rail.locator('[data-missing="results"]')).toBeVisible();

  // Saved again as it is typed: green, and the odds panel opens.
  await open.getByLabel('Zalgiris Kaunas').fill('90');
  await open.getByLabel('Real Madrid').fill('85');
  await expect(open.getByLabel('Zalgiris Kaunas')).toHaveClass(/border-ok/);
  await open.getByRole('button', { name: 'Koeficientai' }).click();
  await expect(open.getByTestId('odds-panel')).toContainText('pt');

  // A level pair is refused in sportbet's words, then put right.
  await open.getByLabel('Real Madrid').fill('90');
  await expect(open.getByRole('alert')).toHaveText(
    'Lygiosios negalimos - komandų rezultatai turi skirtis.',
  );
  await open.getByLabel('Real Madrid').fill('85');
  await expect(open.getByLabel('Real Madrid')).toHaveClass(/border-ok/);

  // The started game: locked on the list, and on its own page.
  const started = page.locator(
    '[data-testid="prediction-row"][data-game="9002"]',
  );
  await expect(started.getByLabel('Real Madrid')).toBeDisabled();
  await page.goto('/prediction/game/9002');
  await expect(
    page.getByText('Žaidimas jau prasidėjo - spėjimų keisti negalima.'),
  ).toBeVisible();

  // The seeded account is a superadmin (R-26 amended): the rail links
  // "Administravimas", and its page has sportbet's three tiles.
  await page.goto('/');
  await rail.getByRole('link', { name: 'Administravimas' }).click();
  await expect(page).toHaveURL('/admin/index');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Admin skydelis' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Rezultatai (turas)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Perskaičiuoti taškus' }),
  ).toBeVisible();

  // "Visi rezultatai": the started game takes a result, saved when a box
  // is left or Enter pressed, never per keystroke. One box alone is
  // yellow and not sent; both, green.
  await page.getByRole('link', { name: 'Visi rezultatai' }).click();
  await expect(page).toHaveURL('/admin/resultsAll');
  const resultHome = page.getByLabel(
    'Real Madrid - Zalgiris Kaunas: namų komanda',
  );
  const resultAway = page.getByLabel(
    'Real Madrid - Zalgiris Kaunas: svečių komanda',
  );
  await resultHome.fill('85');
  await resultHome.press('Tab');
  await expect(resultHome).toHaveClass(/border-warn/);
  await resultAway.fill('80');
  await resultAway.press('Enter');
  await expect(resultAway).toHaveClass(/border-ok/);

  // The predictions list shows the game scored.
  const scored = page.getByTestId('scored-line').filter({ hasText: '85:80' });
  await page.goto('/prediction/results?event=all');
  await expect(scored).toBeVisible();
  await expect(started).toHaveCount(0);

  // The game page (slice 8): the rail's "Pradžia" is /main, the player's
  // home, with its progress line, tiles, table, deck and games.
  await rail.getByRole('link', { name: 'Pradžia' }).click();
  await expect(page).toHaveURL('/main');
  await expect(page.locator('[data-panel="progress"]')).toBeVisible();
  await expect(page.locator('[data-panel="tiles"]')).toContainText('vieta');
  await expect(page.locator('[data-panel="league-table"]')).toContainText(
    'Taškų lentelė',
  );
  await expect(page.locator('[data-panel="league-table"]')).toContainText(
    'savininkas',
  );
  await expect(page.locator('[data-panel="fixture-deck"]')).toContainText(
    'Artimiausios rungtynės',
  );

  // Leagues (slice 12a, #29): the seeded account selects "Draugų lyga", so
  // the table lists its full members and leaves out its guest; switching to
  // the tournament's public league from the rail lists the guest too, and
  // stays there for the compare step below.
  const table = page.locator('[data-panel="league-table"]');
  await expect(table).toContainText('zaidejas');
  await expect(table).not.toContainText('svecias');
  await rail.getByRole('button', { name: 'Draugų lyga' }).click();
  await rail.getByRole('button', { name: 'Euroleague 2026/27' }).click();
  await expect(page).toHaveURL('/main');
  await expect(page.getByRole('status')).toContainText('Lyga pakeista');
  await expect(table).toContainText('svecias');
  await expect(table).toContainText('zaidejas');

  // "Visos rungtynės" takes no prediction (R-74 amended): a click on a game
  // opens its own page, whose boxes save as the list's do.
  const games = page.locator('[data-panel="games-list"]');
  await expect(games).toContainText('Visos rungtynės');
  await games
    .getByTestId('games-row')
    .filter({ hasText: '90:85' })
    .getByRole('link')
    .first()
    .click();
  await expect(page).toHaveURL('/prediction/game/9001');
  const singleAway = page.getByLabel('Real Madrid');
  await singleAway.fill('84');
  await expect(singleAway).toHaveClass(/border-ok/);
  await page.goto('/prediction/results');
  await expect(open.getByLabel('Real Madrid')).toHaveValue('84');

  // The standings ladder (slice 9, #23): the rail's "Eiga". The seeded
  // tournament has a full table of 20 teams and a round-5 game, so the page
  // says when standings close (R-80). Team names are read off the page.
  await rail.locator('a[href="/prediction/standings"]').click();
  await expect(page).toHaveURL('/prediction/standings');
  const ladderRows = page.getByTestId('ladder-row');
  await expect(ladderRows).toHaveCount(20);
  await expect(page.getByText(/Prognozės užsidaro/u)).toBeVisible();
  const [top = '', bottom = ''] = await ladderRows.evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-name') ?? ''),
  );
  expect(top).not.toBe('');
  expect(bottom).not.toBe('');
  expect(top).not.toBe(bottom);
  const posted = (path: string) =>
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === path,
    );

  // R-79: no place saved yet; "Išsaugoti šią tvarką" saves the order shown.
  const saveShown = page.getByRole('button', { name: 'Išsaugoti šią tvarką' });
  await expect(page.getByTestId('ladder-rank')).toHaveText(
    Array.from({ length: 20 }, () => '-'),
  );
  const shownSaved = posted('/prediction/standings/reorder');
  await saveShown.click();
  expect((await shownSaved).status()).toBe(200);
  await expect(saveShown).toBeHidden();
  await expect(page.getByTestId('ladder-rank')).toHaveText(
    Array.from({ length: 20 }, (_, index) => String(index + 1)),
  );

  // An arrow moves the club, says so in the live region, keeps the focus
  // on the club's arrow, and saves the order once the presses pause.
  const moved = posted('/prediction/standings/reorder');
  const down = page.getByRole('button', { name: `Nuleisti: ${top}` });
  await down.click();
  await expect(
    page.getByRole('status').filter({ hasText: `${top} - 2 vieta iš 20` }),
  ).toHaveCount(1);
  await expect(down).toBeFocused();
  await expect(
    page.getByRole('button', { name: `Pakelti: ${bottom}` }),
  ).toHaveAttribute('aria-disabled', 'true');
  expect((await moved).status()).toBe(200);
  await expect(ladderRows.first()).toHaveAttribute('data-name', bottom);

  // R-78: ticking 1/2 ticks 1/4 too; then F names the champion.
  const ticked = posted('/prediction/standings/save');
  await page.getByLabel(`1/2: ${bottom}`, { exact: true }).check();
  await expect(
    page.getByLabel(`1/4: ${bottom}`, { exact: true }),
  ).toBeChecked();
  expect((await ticked).status()).toBe(200);
  const champion = page.getByLabel(`F: ${bottom}`, { exact: true });
  await expect(champion).toBeEnabled();
  await expect(page.getByLabel(`F: ${top}`, { exact: true })).toBeDisabled();
  const named = posted('/prediction/standings/save');
  await champion.fill('1');
  expect((await named).status()).toBe(200);

  // Reloaded: the order, both ticks and the final place are kept.
  await page.reload();
  await expect(ladderRows.first()).toHaveAttribute('data-name', bottom);
  await expect(ladderRows.nth(1)).toHaveAttribute('data-name', top);
  await expect(saveShown).toHaveCount(0);
  await expect(
    page.getByLabel(`1/4: ${bottom}`, { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel(`1/2: ${bottom}`, { exact: true }),
  ).toBeChecked();
  await expect(champion).toHaveValue('1');
  await expect(
    page.getByLabel(`1/2: ${top}`, { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByTestId('ladder-counters')).toContainText(
    'Vieta: 20 / 20',
  );
  await expect(page.getByTestId('ladder-counters')).toContainText('F: 1 / 2');

  // Survival (slice 10, #27): the seeded round 1 plays survival, with one
  // game still open (9004) beside the pair whose return game has started
  // (9001, 9002). Both survival entries are "Išlikimas", so each is found
  // by its address; team names are read off the grid.
  const survivalLink = rail.locator('a[href="/prediction/predictionSurvival"]');
  await survivalLink.click();
  await expect(page).toHaveURL('/prediction/predictionSurvival');
  const grid = page.getByRole('radiogroup', { name: 'Rinkis komandą' });
  const selectable = grid.locator('input[type="radio"]:not([disabled])');
  await expect(selectable).toHaveCount(2);
  const nameOf = async (index: number) => {
    const id = await selectable.nth(index).getAttribute('aria-labelledby');
    return (await page.locator(`[id="${id ?? ''}"]`).textContent()) ?? '';
  };
  const firstPick = await nameOf(0);
  const secondPick = await nameOf(1);
  expect(firstPick).not.toBe('');
  expect(secondPick).not.toBe(firstPick);
  // A team's card is its label; the radio inside it is visually hidden.
  const cardOf = (name: string) =>
    grid
      .locator('label')
      .filter({ has: page.getByText(name, { exact: true }) });

  // A pick saves at once and the stake follows it; a switch saves too.
  const firstSaved = posted('/prediction/predictionSurvival/save');
  await cardOf(firstPick).click();
  expect((await firstSaved).status()).toBe(200);
  await expect(page.getByTestId('survival-stake')).not.toHaveText('+10/12');
  const switched = posted('/prediction/predictionSurvival/save');
  await cardOf(secondPick).click();
  expect((await switched).status()).toBe(200);

  // Reloaded: the switch was kept. A team whose game has started is
  // offered disabled, with its lock, rather than refused.
  await page.reload();
  await expect(
    grid.getByRole('radio', { name: secondPick, exact: true }),
  ).toBeChecked();
  const startedCards = grid.locator('input[type="radio"][disabled]');
  await expect(startedCards).toHaveCount(2);
  await expect(page.getByText('Rungtynės prasidėjo').first()).toBeVisible();
  // Posted anyway (a page drawn before the tip-off): sportbet's refusal.
  const startedTeam = await startedCards.first().getAttribute('value');
  const refusal = await page.evaluate(async (team) => {
    const answer = await fetch('/prediction/predictionSurvival/save', {
      method: 'POST',
      body: new URLSearchParams({ teamID: team ?? '', round: '1' }),
    });
    const body: unknown = await answer.json();
    return { status: answer.status, body };
  }, startedTeam);
  expect(refusal).toEqual({
    status: 422,
    body: { success: false, message: 'Šios komandos rungtynės jau prasidėjo.' },
  });
  await page.reload();
  await expect(
    grid.getByRole('radio', { name: secondPick, exact: true }),
  ).toBeChecked();

  // The summary: the viewer's round-1 tile shows their own team.
  await rail.locator('a[href="/summary/predictionSurvivals"]').click();
  await expect(page).toHaveURL('/summary/predictionSurvivals');
  const myRow = page.locator('[data-testid="survival-row"][data-me="true"]');
  await expect(myRow.getByTestId('survival-tile').first()).toHaveAttribute(
    'title',
    new RegExp(` · ${secondPick} · dar nežinoma$`, 'u'),
  );

  // "Suvestinė" (slice 11, #28), while 9002 has its result 85:80. A started
  // game shows a verdict badge, in the rail's "Prognozės".
  await rail.locator('a[href="/summary/prediction/results"]').click();
  await expect(page).toHaveURL('/summary/prediction/results');
  const startedGame = page.getByRole('row').filter({
    has: page.getByTestId('sr-result').filter({ hasText: '85:80' }),
  });
  await expect(startedGame.getByTestId('sr-badge').first()).toBeVisible();
  await expect(startedGame.getByTestId('sr-points').first()).toBeVisible();

  // "Eiga": the legend, and the ladder's picks in the club's cells (stages
  // are not decided yet, so every tick is pending).
  await rail.locator('a[href="/summary/prediction/standings"]').click();
  await expect(page).toHaveURL('/summary/prediction/standings');
  await expect(page.getByTestId('sst-legend')).toContainText('Pataikyta');
  // Other players registered by the earlier specs add their own columns
  // (their badges read "-"), so the viewer's four sit together in the row.
  const ladderBadges = page
    .getByTestId('sst-team-row')
    .filter({ hasText: bottom })
    .getByTestId('sst-badge');
  await expect(ladderBadges.first()).toBeVisible();
  expect((await ladderBadges.allTextContents()).join(' ')).toContain('1 ✓ ✓ 1');

  // "Grafikas": a line for every player in the legend.
  await rail.locator('a[href="/summary/chart"]').click();
  await expect(page).toHaveURL('/summary/chart');
  await expect(page.getByText('Taškų dinamika', { exact: true })).toBeVisible();
  const legend = page.locator('button[aria-pressed]');
  const listed = await legend.count();
  expect(listed).toBeGreaterThan(0);
  await expect(page.getByTestId('chart-line')).toHaveCount(listed);

  // Compare: a second player registers in their own browser (and so plays
  // this tournament, R-48); from "Pradžia", their name opens compare.
  // Its own address (the stack has no proxy, so the header is the client's):
  // registration is 3 a minute per IP and register.spec.ts runs right after.
  const second = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.77' },
  });
  const secondPage = await second.newPage();
  const who = newcomer(1280);
  // The cookie bar first: the dialog /register opens covers it.
  await secondPage.goto('/');
  await answerCookies(secondPage);
  await secondPage.goto('/register');
  await register(secondPage, who);
  await second.close();
  await rail.getByRole('link', { name: 'Pradžia' }).click();
  await expect(page).toHaveURL('/main');
  const nameLink = page
    .locator('[data-panel="league-table"]')
    .getByRole('link', { name: who.username });
  await expect(nameLink).toBeVisible();
  const compareHref = (await nameLink.getAttribute('href')) ?? '';
  expect(compareHref).toMatch(/^\/compare\/[1-9][0-9]*$/u);
  await nameLink.click();
  await expect(page).toHaveURL(compareHref);
  await expect(page.getByText('Bendri statistikos')).toBeVisible();
  await expect(page.getByText('Etapai')).toBeVisible();

  // A guest, while the game has a result: the rail offers "Lyderiai", and
  // /leaderboard lists the players.
  const guest = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const guestPage = await guest.newPage();
  await guestPage.goto('/');
  const guestRail = guestPage.getByTestId('rail');
  await guestRail.getByRole('link', { name: 'Lyderiai' }).click();
  await expect(guestPage).toHaveURL('/leaderboard');
  await expect(
    guestPage.getByText('Lyderių lentelė', { exact: true }),
  ).toBeVisible();
  await expect(
    guestPage.getByText('savininkas', { exact: true }),
  ).toBeVisible();

  // Cleared: grey, and the list shows the game locked again.
  await page.goto('/admin/resultsAll');
  await resultHome.fill('');
  await resultAway.fill('');
  await resultAway.press('Enter');
  await expect(resultAway).not.toHaveClass(/border-ok|border-warn/);
  await page.goto('/prediction/results?event=all');
  await expect(started.getByLabel('Real Madrid')).toBeDisabled();
  await expect(scored).toHaveCount(0);

  // With no result left, the guest's rail stops offering "Lyderiai"
  // (issue 131), and /leaderboard says why it is empty.
  await guestPage.goto('/');
  await expect(guestRail.getByRole('link', { name: 'Lyderiai' })).toHaveCount(
    0,
  );
  await guestPage.goto('/leaderboard');
  await expect(
    guestPage.getByText('Lyderių lentelė', { exact: true }),
  ).toBeVisible();

  // The standings page sends a guest to sign in (its return there after
  // the code is the feature tests'; the address's codes are spent).
  await guestPage.goto('/prediction/standings');
  await expect(guestPage).toHaveURL('/');
  await expect(
    guestPage.getByRole('dialog', { name: 'Prisijungti' }),
  ).toBeVisible();
  await guest.close();

  // At a phone width: the "Spėjimai" tab, and no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/prediction/results');
  await expect(
    page.getByTestId('bottom-tabs').getByRole('link', { name: 'Spėjimai' }),
  ).toBeVisible();
  await expect(open.getByLabel('Zalgiris Kaunas')).toHaveValue('90');
  expect(await scrollsSideways(page)).toBe(false);
  await page.goto('/main');
  await expect(page.locator('[data-panel="league-table"]')).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);

  // The bottom tab's drop-up offers the other league; switching narrows the
  // table, and the drop-up then offers the public league back.
  const tabs = page.getByTestId('bottom-tabs');
  await tabs.getByRole('button', { name: 'Euroleague 2026/27' }).click();
  await tabs.getByRole('button', { name: 'Draugų lyga' }).click();
  await expect(page).toHaveURL('/main');
  await expect(page.locator('[data-panel="league-table"]')).not.toContainText(
    'svecias',
  );
  await tabs.getByRole('button', { name: 'Draugų lyga' }).click();
  await tabs.getByRole('button', { name: 'Euroleague 2026/27' }).click();
  await expect(page.locator('[data-panel="league-table"]')).toContainText(
    'svecias',
  );
  await page.goto('/admin/resultsAll');
  await expect(resultHome).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  await page
    .getByTestId('bottom-tabs')
    .locator('a[href="/prediction/standings"]')
    .click();
  await expect(page).toHaveURL('/prediction/standings');
  await expect(ladderRows.first()).toHaveAttribute('data-name', bottom);
  await expect(champion).toHaveValue('1');
  expect(await scrollsSideways(page)).toBe(false);

  // At the phone width the ladder works as on the desktop: an arrow moves
  // a club back up and saves the order; a tick saves its row.
  const phoneMoved = posted('/prediction/standings/reorder');
  const up = page.getByRole('button', { name: `Pakelti: ${top}` });
  await up.click();
  await expect(
    page.getByRole('status').filter({ hasText: `${top} - 1 vieta iš 20` }),
  ).toHaveCount(1);
  await expect(up).toBeFocused();
  expect((await phoneMoved).status()).toBe(200);
  await expect(ladderRows.first()).toHaveAttribute('data-name', top);
  const phoneTicked = posted('/prediction/standings/save');
  await page.getByLabel(`1/4: ${top}`, { exact: true }).check();
  expect((await phoneTicked).status()).toBe(200);
  expect(await scrollsSideways(page)).toBe(false);
  await page.reload();
  await expect(ladderRows.first()).toHaveAttribute('data-name', top);
  await expect(page.getByLabel(`1/4: ${top}`, { exact: true })).toBeChecked();
  await expect(
    page.getByLabel(`1/2: ${top}`, { exact: true }),
  ).not.toBeChecked();
  await expect(champion).toHaveValue('1');
  await expect(page.getByTestId('ladder-counters')).toContainText('1/4: 2 / 8');

  // Both survival pages fit the phone: the "Išlikimas" tab, no sideways scroll.
  await page
    .getByTestId('bottom-tabs')
    .locator('a[href="/prediction/predictionSurvival"]')
    .click();
  await expect(page).toHaveURL('/prediction/predictionSurvival');
  await expect(grid).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  await page.goto('/summary/predictionSurvivals');
  await expect(myRow).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);

  // The summaries, the chart and compare fit the phone: their grids scroll
  // inside their own wrappers, never the page.
  for (const path of [
    '/summary/prediction/results',
    '/summary/prediction/standings',
    '/summary/chart',
    compareHref,
  ]) {
    await page.goto(path);
    await expect(page.getByRole('main')).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
  }
});
