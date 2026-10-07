import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { LEADERBOARD_PATH } from '../../src/components/shell/shell-paths';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser, documentOf, type Page } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { gamesOf, savePlaying } from '../support/predictions';
import { CLOSED } from '../support/registration';

// /leaderboard (slice 8c, #22): MainController::leaderboard, public, and
// "Lyderiai" for a guest once it has entries (issue 131).

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const [PLAYED] = gamesOf(CLOSED);

/** Jonas playing CLOSED (public), its round-1 game scored through the results page. */
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

/** The usernames /leaderboard lists, in order. */
const listed = async () =>
  [
    ...documentOf(await guest().get(LEADERBOARD_PATH)).querySelectorAll(
      'tbody tr td:nth-child(2)',
    ),
  ].map((cell) => cell.textContent);

const guest = () => new Browser(baseUrl, '192.0.2.71');

const lyderiaiOn = (page: Page) =>
  [...documentOf(page).querySelectorAll('a')].filter(
    (link) =>
      link.getAttribute('href') === LEADERBOARD_PATH &&
      link.textContent.includes('Lyderiai'),
  ).length;

describe('GET /leaderboard (MainController::leaderboard)', () => {
  it('offers a guest no "Lyderiai" before any game is scored (issue 131)', async () => {
    expect(lyderiaiOn(await guest().get('/'))).toBe(0);
  });

  it('is public: a guest gets the page, with its title and charity card', async () => {
    const page = await guest().get(LEADERBOARD_PATH);
    expect(page.status).toBe(200);
    expect(page.html).toContain('Lyderių lentelė');
    expect(page.html).toContain('Sužinoti daugiau apie labdarą');
  });

  it('lists a scored player, and a guest is then offered "Lyderiai" on the rail and as a pill', async () => {
    await jonasScored();
    const page = await guest().get(LEADERBOARD_PATH);
    expect(page.status).toBe(200);
    const rows = [...documentOf(page).querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('jonas');
    expect(page.html).toContain('Sužinoti daugiau apie labdarą');
    expect(lyderiaiOn(await guest().get('/'))).toBe(2);
  });

  it('a signed-in player can read it too, and is not offered the guest entry', async () => {
    await jonasScored();
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const page = await browser.get(LEADERBOARD_PATH);
    expect(page.status).toBe(200);
    expect(lyderiaiOn(page)).toBe(0);
  });

  it("is read at most once a minute: a change made behind the app's back does not show yet", async () => {
    await jonasScored();
    expect(await listed()).toEqual(['jonas']);
    await client.query("update players set username = 'jonukas' where id = 1");
    expect(await listed()).toEqual(['jonas']);
  });

  it('a saved result or a recalculation shows at once: each expires the cached read', async () => {
    const browser = await jonasScored();
    expect(await listed()).toEqual(['jonas']);
    await client.query("update players set username = 'jonukas' where id = 1");
    const recalculated = await browser.post(
      '/admin/recalculateAllGamePoints',
      new FormData(),
    );
    expect(recalculated.status).toBe(303);
    expect(await listed()).toEqual(['jonukas']);
  });
});
