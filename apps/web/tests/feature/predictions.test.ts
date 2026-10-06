import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import {
  Browser,
  documentOf,
  setCookieFor,
  type Page,
} from '../support/browser';
import { gamesOf, jonasPlaying } from '../support/predictions';
import { CLOSED, SOONER } from '../support/registration';

// The predictions page (slice 6a, #20): getPredictionResultsUser, the
// "Spėjimai" entry and its badge, against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

/** The games of the page's open and locked rows, in order. */
const rowsOn = (page: Page) =>
  [...documentOf(page).querySelectorAll('[data-testid="prediction-row"]')].map(
    (row) => Number(row.getAttribute('data-game')),
  );

describe('/prediction/results (getPredictionResultsUser)', () => {
  it('a player sees their rows of the current round, with the round menu', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const page = await browser.get('/prediction/results');
    expect(page.status).toBe(200);
    const [first] = gamesOf(SOONER);
    expect(rowsOn(page)).toEqual([first]);
    const menu = documentOf(page).querySelector('select');
    expect(
      [...(menu?.querySelectorAll('option') ?? [])].map(
        (option) => option.textContent,
      ),
    ).toEqual(['Visi etapai', '1 turas', '5 turas']);
  });

  it('R-58: ?event=all shows every round; ?event=<id> one; an unknown id nothing', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    expect(rowsOn(await browser.get('/prediction/results?event=all'))).toEqual([
      ...gamesOf(SOONER),
    ]);
    expect(rowsOn(await browser.get('/prediction/results?event=415'))).toEqual([
      415,
    ]);
    const unknown = await browser.get('/prediction/results?event=999');
    expect(rowsOn(unknown)).toEqual([]);
    expect(unknown.html).toContain('Nėra rungtynių.');
  });

  it("a started game's row is locked: its boxes disabled", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, CLOSED);
    const page = await browser.get('/prediction/results?event=all');
    const boxes = documentOf(page).querySelectorAll(
      '[data-testid="prediction-row"] input',
    );
    expect(boxes.length).toBe(4);
    for (const box of boxes) expect(box.hasAttribute('disabled')).toBe(true);
  });

  it('a player in no tournament sees "Nėra rungtynių."', async () => {
    const browser = await jonasPlaying(db, client, baseUrl);
    expect((await browser.get('/prediction/results')).html).toContain(
      'Nėra rungtynių.',
    );
  });

  it('a guest is sent to sign in, to come back here', async () => {
    const page = await new Browser(baseUrl, '192.0.2.60').get(
      '/prediction/results?event=all',
    );
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=${encodeURIComponent('/prediction/results?event=all')}`,
    );
  });
});

describe('"Spėjimai" and its badge (MissingPredictions)', () => {
  const badge = async (browser: Browser) =>
    documentOf(await browser.get('/'))
      .querySelector('[data-testid="rail"] [data-missing="results"]')
      ?.hasAttribute('hidden');

  it("a player's rail links to the page, its badge shown while the current round has an open game unanswered", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const page = await browser.get('/');
    expect(
      documentOf(page).querySelector(
        '[data-testid="rail"] a[href="/prediction/results"]',
      )?.textContent,
    ).toContain('Spėjimai');
    expect(await badge(browser)).toBe(false);
    const [first] = gamesOf(SOONER);
    await client.query(
      'update match_predictions set home = 88, away = 79 where player_id = 1 and game_id = $1',
      [first],
    );
    expect(await badge(browser)).toBe(true);
  });

  it('no badge when the current round has no open game: every game of CLOSED has started', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, CLOSED);
    expect(await badge(browser)).toBe(true);
  });
});

describe('sign-in back to the prediction pages (the return path)', () => {
  it('/login keeps /prediction/results?event=all and /prediction/game/<id>', async () => {
    for (const path of [
      '/prediction/results?event=all',
      '/prediction/game/411',
    ]) {
      const page = await new Browser(baseUrl, '192.0.2.61').get(
        `/login?intended=${encodeURIComponent(path)}`,
      );
      expect(setCookieFor(page, '__Host-sb_return')).toContain(
        `__Host-sb_return=${encodeURIComponent(path)};`,
      );
    }
  });
});
