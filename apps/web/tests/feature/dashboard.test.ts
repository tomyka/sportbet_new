import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import {
  MAIN_PATH,
  PREDICTION_SAVE_PATH,
} from '../../src/components/shell/shell-paths';
import { JONAS_ACCOUNT, saveAccounts } from '../support/accounts';
import { Browser, documentOf, type Page } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { gamesOf, jonasPlaying, savePlaying } from '../support/predictions';
import { CLOSED, SOONER } from '../support/registration';

// /main, the game page (slice 8a, #22): MainController::loadApp, the
// player's home since slice 8, against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const [PLAYED] = gamesOf(CLOSED);

/** Jonas playing CLOSED, its round-1 game scored 85-80 through the results page. */
async function jonasScored(): Promise<Browser> {
  const browser = await signedInBrowser(
    db,
    baseUrl,
    JONAS_ACCOUNT,
    'results-manager',
  );
  await savePlaying(db, client, CLOSED);
  const body = new FormData();
  body.set('gameID', String(PLAYED));
  body.set('homeTeamScore', '85');
  body.set('awayTeamScore', '80');
  expect((await browser.post('/admin/updateResult', body)).status).toBe(200);
  return browser;
}

/** Jonas puts CLOSED's home team first in the final (a standings row of his). */
const pickChampion = () =>
  client.query(
    'insert into standings_predictions (player_id, team_id, play_offs, final_four, final_place) values (1, $1, true, true, 1) on conflict (player_id, team_id) do update set play_offs = true, final_four = true, final_place = 1',
    [CLOSED.id * 10 + 1],
  );

const rowsOf = (page: Page) =>
  [...documentOf(page).querySelectorAll('[data-testid="lb-row"]')].map(
    (row) => ({
      text: row.textContent,
      me: row.getAttribute('data-me'),
    }),
  );

describe('GET /main (MainController::loadApp)', () => {
  it('a guest goes to the hub (MC:88), not to sign in', async () => {
    const page = await new Browser(baseUrl, '192.0.2.61').get(MAIN_PATH);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it('a signed-in player in no tournament goes to the hub (MC:29-31, issue #53)', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const page = await browser.get(MAIN_PATH);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it('a player sees "Taškų lentelė" with their own row highlighted, and their tiles once a game is scored', async () => {
    const browser = await jonasScored();
    const page = await browser.get(MAIN_PATH);
    expect(page.status).toBe(200);
    const document = documentOf(page);
    expect(page.html).toContain('Taškų lentelė');
    const [row] = rowsOf(page);
    expect(row?.me).toBe('true');
    expect(row?.text).toContain('jonas');
    const tiles = [...document.querySelectorAll('[data-testid="tile"]')].map(
      (tile) => tile.textContent,
    );
    expect(tiles[0]).toBe('vieta#1');
    expect(tiles.map((tile) => tile.replace(/[#\d.-]+$/, ''))).toEqual([
      'vieta',
      'taškai',
      'bingo',
      'serija',
    ]);
  });

  it('before any game is scored, the table is drawn and no tiles', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    await savePlaying(db, client, CLOSED);
    const page = await browser.get(MAIN_PATH);
    expect(page.status).toBe(200);
    expect(rowsOf(page)).toHaveLength(1);
    expect(documentOf(page).querySelector('[data-testid="tile"]')).toBeNull();
  });

  it('"Finalų dalyvių prognozės" once the first game has tipped off: the listed players\' final places', async () => {
    const browser = await jonasScored();
    await pickChampion();
    const page = await browser.get(MAIN_PATH);
    expect(page.html).toContain('Finalų dalyvių prognozės');
    const row = documentOf(page).querySelector('[data-testid="medal-row"]');
    expect(row?.textContent).toBe(`Home ${String(CLOSED.id)}1000`);
  });

  it('"Pradžia" on the rail and the brand lead a player to /main', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    await savePlaying(db, client, CLOSED);
    const document = documentOf(await browser.get(MAIN_PATH));
    const rail = document.querySelector('[data-testid="rail"]');
    const pradzia = [...(rail?.querySelectorAll('a') ?? [])].find(
      (link) => link.textContent.trim() === 'Pradžia',
    );
    expect(pradzia?.getAttribute('href')).toBe(MAIN_PATH);
    const brands = [...document.querySelectorAll('img[alt="SportBet"]')].map(
      (logo) => logo.closest('a')?.getAttribute('href'),
    );
    expect(brands.length).toBeGreaterThan(0);
    expect(brands.every((href) => href === MAIN_PATH)).toBe(true);
  });

  it("a guest's brand leads to the tournaments", async () => {
    const page = await new Browser(baseUrl, '192.0.2.62').get('/');
    const brands = [
      ...documentOf(page).querySelectorAll('img[alt="SportBet"]'),
    ].map((logo) => logo.closest('a')?.getAttribute('href'));
    expect(brands.length).toBeGreaterThan(0);
    expect(brands.every((href) => href === '/')).toBe(true);
  });
});

describe("the tournament page's league table (TournamentController::show)", () => {
  it('shows the listed players, with no own row even for a signed-in player', async () => {
    const browser = await jonasScored();
    const page = await browser.get(`/tournament/${CLOSED.tournament.slug}`);
    expect(page.status).toBe(200);
    expect(page.html).toContain('Taškų lentelė');
    const rows = rowsOf(page);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toContain('jonas');
    expect(rows[0]?.me).toBeNull();
  });

  it('shows the medals of the listed players, as the game page does', async () => {
    const browser = await jonasScored();
    await pickChampion();
    const page = await browser.get(`/tournament/${CLOSED.tournament.slug}`);
    expect(page.html).toContain('Finalų dalyvių prognozės');
    expect(
      documentOf(page).querySelector('[data-testid="medal-row"]')?.textContent,
    ).toBe(`Home ${String(CLOSED.id)}1000`);
  });

  it('is read at most once a minute, and afresh once the points change (pointsChanged)', async () => {
    const browser = await jonasScored();
    const path = `/tournament/${CLOSED.tournament.slug}`;
    const names = async () =>
      rowsOf(await browser.get(path)).map(({ text }) => text);
    expect((await names())[0]).toContain('jonas');
    await client.query("update players set username = 'jonukas' where id = 1");
    expect((await names())[0]).not.toContain('jonukas');
    const recalculated = await browser.post(
      '/admin/recalculateAllGamePoints',
      new FormData(),
    );
    expect(recalculated.status).toBe(303);
    expect((await names())[0]).toContain('jonukas');
  });

  it('a guest sees it too', async () => {
    await saveAccounts(db, [JONAS_ACCOUNT], 'player');
    await savePlaying(db, client, CLOSED);
    const page = await new Browser(baseUrl, '192.0.2.63').get(
      `/tournament/${CLOSED.tournament.slug}`,
    );
    expect(page.status).toBe(200);
    expect(rowsOf(page)).toHaveLength(1);
  });
});

describe("/main's games (fixture-deck.blade.php, games.blade.php)", () => {
  const [OPEN_GAME] = gamesOf(SOONER);

  it('a player sees the current round\'s game as a card with "Spėti" and as a row of "Visos rungtynės"', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const page = await browser.get(MAIN_PATH);
    expect(page.status).toBe(200);
    const document = documentOf(page);
    expect(page.html).toContain('Artimiausios rungtynės');
    expect(page.html).toContain('Visos rungtynės');
    const [card] = document.querySelectorAll('[data-testid="deck-card"]');
    expect(card?.getAttribute('href')).toBe('/prediction/results');
    expect(card?.textContent).toContain('Spėti');
    expect(document.querySelectorAll('[data-testid="games-row"]')).toHaveLength(
      1,
    );
  });

  it("a prediction made from the list saves through the predictions page's save, and /main then shows it (R-74)", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const body = new FormData();
    body.set('gameID', String(OPEN_GAME));
    body.set('prediction_gameID', String(OPEN_GAME));
    body.set('homeTeamScore', '88');
    body.set('awayTeamScore', '79');
    const saved = await browser.post(PREDICTION_SAVE_PATH, body);
    expect(saved.status).toBe(200);
    const document = documentOf(await browser.get(MAIN_PATH));
    expect(
      document.querySelector('[data-testid="games-row"]')?.textContent,
    ).toContain('88:79');
    const card = document.querySelector('[data-testid="deck-card"]');
    expect(card?.textContent).toContain('88');
    expect(card?.textContent).toContain('79');
  });

  it('a started game\'s card offers nothing, not "Keisti" (R-75)', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, CLOSED);
    const page = await browser.get(MAIN_PATH);
    // The shell's "Keisti turnyrą" is elsewhere on the page: the cards only.
    const cards = [
      ...documentOf(page).querySelectorAll('[data-testid="deck-card"]'),
    ];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).not.toContain('Spėti');
    expect(cards[0]?.textContent).not.toContain('Keisti');
  });
});
