import { listPlayerSettings, savePlayerSettings } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser } from '../support/browser';
import { ACTIVE_PROFILE, signedInBrowser, withProfile } from '../support/hub';
import {
  LATER,
  saveTournamentWithGames,
  SOONER,
} from '../support/registration';

// TournamentController::enter and exit, the registration form and its
// submit (slice 5b, #19), against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const enterBody = () => new FormData();

/** Jonas, signed in, in SOONER (41); LATER (42) open to him. */
async function jonasInSooner(): Promise<Browser> {
  await saveTournamentWithGames(db, SOONER);
  await saveTournamentWithGames(db, LATER);
  await withProfile(db, SOONER.tournament.slug, ACTIVE_PROFILE);
  await withProfile(db, LATER.tournament.slug, ACTIVE_PROFILE);
  const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
  await client.query(
    'insert into tournament_players (tournament_id, player_id, switched_off, admin_hidden, fill_ins) values (41, 1, false, false, 0)',
  );
  return browser;
}

const lastTournament = async () =>
  (await listPlayerSettings(db))[0]?.lastTournament ?? null;

describe('enter (TournamentController::enter)', () => {
  it('a player in the tournament makes it their last used (R-28) and goes home', async () => {
    const browser = await jonasInSooner();
    const page = await browser.post(
      `/tournament/${SOONER.tournament.slug}/enter`,
      enterBody(),
    );
    expect(page.status).toBe(303);
    expect(page.location).toBe('/');
    expect(await lastTournament()).toBe(SOONER.id);
  });

  it('a player not in it goes to its page, and nothing is written', async () => {
    const browser = await jonasInSooner();
    const page = await browser.post(
      `/tournament/${LATER.tournament.slug}/enter`,
      enterBody(),
    );
    expect(page.location).toBe(`/tournament/${LATER.tournament.slug}`);
    expect(await lastTournament()).toBeNull();
  });

  it('a guest goes to sign in, before the slug is looked at', async () => {
    const page = await new Browser(baseUrl, '192.0.2.50').post(
      '/tournament/no-such/enter',
      enterBody(),
    );
    expect(page.status).toBe(303);
    expect(page.location).toBe('/login');
  });

  it('an unknown tournament is not found', async () => {
    const browser = await jonasInSooner();
    expect(
      (await browser.post('/tournament/no-such/enter', enterBody())).status,
    ).toBe(404);
  });

  it('a non-public tournament the player is not in is not found (R-50), and nothing is written', async () => {
    const browser = await jonasInSooner();
    await withProfile(db, LATER.tournament.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    expect(
      (
        await browser.post(
          `/tournament/${LATER.tournament.slug}/enter`,
          enterBody(),
        )
      ).status,
    ).toBe(404);
    expect(await lastTournament()).toBeNull();
  });

  it('a POST from another site is refused, and nothing is written', async () => {
    const browser = await jonasInSooner();
    const page = await browser.post(
      `/tournament/${SOONER.tournament.slug}/enter`,
      enterBody(),
      { origin: 'https://evil.example' },
    );
    expect(page.status).toBe(403);
    expect(await lastTournament()).toBeNull();
  });

  it("R-53's GET does what the card's POST does, for a player in the tournament", async () => {
    const browser = await jonasInSooner();
    const page = await browser.get(
      `/tournament/${SOONER.tournament.slug}/enter`,
    );
    expect(page.status).toBe(303);
    expect(page.location).toBe('/');
    expect(await lastTournament()).toBe(SOONER.id);
  });
});

describe('exit (TournamentController::exit, "Keisti turnyrą")', () => {
  it('forgets the last-used tournament and goes to the hub', async () => {
    const browser = await jonasInSooner();
    await savePlayerSettings(db, [
      {
        player: JONAS_ACCOUNT.id,
        locale: 'lt',
        adminLevel: 0,
        lastTournament: SOONER.id,
      },
    ]);
    const page = await browser.get('/tournaments/exit');
    expect(page.status).toBe(302);
    expect(page.location).toBe('/');
    expect(await lastTournament()).toBeNull();
  });

  it('a guest just goes to the hub', async () => {
    const page = await new Browser(baseUrl, '192.0.2.51').get(
      '/tournaments/exit',
    );
    expect(page.location).toBe('/');
  });
});
