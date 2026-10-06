import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { Browser, documentOf } from '../support/browser';
import { ACTIVE_PROFILE, withProfile } from '../support/hub';
import { gamesOf, jonasPlaying } from '../support/predictions';
import {
  CLOSED,
  LATER,
  saveTournamentWithGames,
  SOONER,
} from '../support/registration';

// /prediction/game/<id> (slice 6c, #20): showSingleGame, the reminder
// mail's link, against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

describe('/prediction/game/<id> (showSingleGame)', () => {
  it("an open game of Jonas's: the form", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const [open] = gamesOf(SOONER);
    const page = await browser.get(`/prediction/game/${String(open)}`);
    expect(page.status).toBe(200);
    expect(
      documentOf(page).querySelector('[data-testid="single-game-form"]'),
    ).not.toBeNull();
    expect(page.html).toContain('Home 41');
  });

  it('a started game: locked, "Žaidimas jau prasidėjo"', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, CLOSED);
    const [started] = gamesOf(CLOSED);
    const page = await browser.get(`/prediction/game/${String(started)}`);
    expect(page.html).toContain(
      'Žaidimas jau prasidėjo - spėjimų keisti negalima.',
    );
    expect(
      documentOf(page).querySelector('[data-testid="single-game-form"]'),
    ).toBeNull();
  });

  it('a game of a public tournament Jonas does not play: "Spėjimas nerastas"', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    await saveTournamentWithGames(db, LATER);
    await withProfile(db, LATER.tournament.slug, ACTIVE_PROFILE);
    const [notHis] = gamesOf(LATER);
    const page = await browser.get(`/prediction/game/${String(notHis)}`);
    expect(page.html).toContain('Spėjimas nerastas. Bandykite dar kartą nuo');
  });

  it('an unknown game, or one that is no id, is a 404', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    expect((await browser.get('/prediction/game/999999')).status).toBe(404);
    expect((await browser.get('/prediction/game/abc')).status).toBe(404);
    // Past Postgres' integer (games.id): refused before the query, not a 500.
    for (const id of ['2147483648', '9999999999']) {
      expect((await browser.get(`/prediction/game/${id}`)).status).toBe(404);
    }
  });

  it("R-50: a non-public tournament's game is a 404 for a player not in it", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    await saveTournamentWithGames(db, LATER);
    await withProfile(db, LATER.tournament.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    const [hidden] = gamesOf(LATER);
    expect(
      (await browser.get(`/prediction/game/${String(hidden)}`)).status,
    ).toBe(404);
  });

  it('a guest is sent to sign in, to come back to this game', async () => {
    const page = await new Browser(baseUrl, '192.0.2.80').get(
      '/prediction/game/411',
    );
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=${encodeURIComponent('/prediction/game/411')}`,
    );
  });
});
