import { listPlayerSettings, savePlayerSettings } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { PLAYER_HOME } from '../../src/components/shell/shell-paths';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser, documentOf, setCookieFor } from '../support/browser';
import { ACTIVE_PROFILE, signedInBrowser, withProfile } from '../support/hub';
import {
  CLOSED,
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
    expect(page.status).toBe(303);
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

const FLASH = '__Host-sb_flash';

const rows = async (table: string, tournament: number) =>
  z
    .array(z.object({ n: z.int() }))
    .parse(
      (
        await client.query(
          `select count(*)::int as n from ${table} where player_id = 1 and ${
            table === 'tournament_players'
              ? 'tournament_id = $1'
              : table === 'match_predictions'
                ? 'game_id in (select id from games where tournament_id = $1)'
                : 'team_id in (select id from teams where tournament_id = $1)'
          }`,
          [tournament],
        )
      ).rows,
    )[0]?.n;

describe('the registration form (registerForm)', () => {
  it('a guest is sent to sign in, to come back to the form', async () => {
    await saveTournamentWithGames(db, LATER);
    const page = await new Browser(baseUrl, '192.0.2.52').get(
      `/tournament/${LATER.tournament.slug}/register`,
    );
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=%2Ftournament%2F${LATER.tournament.slug}%2Fregister`,
    );
  });

  it("a player not in it gets sportbet's form", async () => {
    const browser = await jonasInSooner();
    const page = await browser.get(
      `/tournament/${LATER.tournament.slug}/register`,
    );
    expect(page.status).toBe(200);
    const form = documentOf(page).querySelector(
      'form[data-testid="tournament-register"]',
    );
    expect(form?.getAttribute('action')).toBe(
      `/tournament/${LATER.tournament.slug}/register/submit`,
    );
  });

  it('a player already in it is taken in (R-53), and the tournament becomes their last used', async () => {
    const browser = await jonasInSooner();
    const page = await browser.get(
      `/tournament/${SOONER.tournament.slug}/register`,
    );
    expect(page.status).toBe(307);
    expect(page.location).toBe(`/tournament/${SOONER.tournament.slug}/enter`);
    const entered = await browser.get(page.location ?? '');
    expect(entered.location).toBe('/');
    expect(await lastTournament()).toBe(SOONER.id);
  });

  it('a closed tournament goes home with "Registracija į šį turnyrą jau pasibaigė." shown once', async () => {
    const browser = await jonasInSooner();
    await saveTournamentWithGames(db, CLOSED);
    await withProfile(db, CLOSED.tournament.slug, ACTIVE_PROFILE);
    const page = await browser.get(
      `/tournament/${CLOSED.tournament.slug}/register`,
    );
    expect(page.location).toBe(
      `/tournament/${CLOSED.tournament.slug}/register/closed`,
    );
    const hop = await browser.get(page.location ?? '');
    expect(hop.location).toBe('/');
    expect(setCookieFor(hop, FLASH)).toMatch(/Max-Age=60/);
    const home = await browser.get('/');
    expect(documentOf(home).querySelector('[role="alert"]')?.textContent).toBe(
      'Registracija į šį turnyrą jau pasibaigė.',
    );
    expect(setCookieFor(home, FLASH)).toMatch(/Max-Age=0/);
    const again = await browser.get('/');
    expect(documentOf(again).querySelector('[role="alert"]')).toBeNull();
  });
});

describe('the closed hop (register/closed)', () => {
  it('leaves no message, and just goes home, when the form is not closed: an open tournament, an unknown one, or a guest', async () => {
    const browser = await jonasInSooner();
    for (const slug of [LATER.tournament.slug, 'no-such']) {
      const hop = await browser.get(`/tournament/${slug}/register/closed`);
      expect(hop.status).toBe(303);
      expect(hop.location).toBe('/');
      expect(setCookieFor(hop, FLASH)).toBeUndefined();
    }
    const guest = await new Browser(baseUrl, '192.0.2.56').get(
      `/tournament/${LATER.tournament.slug}/register/closed`,
    );
    expect(guest.location).toBe('/');
    expect(setCookieFor(guest, FLASH)).toBeUndefined();
  });

  it('leaves no message for a closed tournament the player may not see (R-50)', async () => {
    const browser = await jonasInSooner();
    await saveTournamentWithGames(db, CLOSED);
    await withProfile(db, CLOSED.tournament.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    const hop = await browser.get(
      `/tournament/${CLOSED.tournament.slug}/register/closed`,
    );
    expect(hop.location).toBe('/');
    expect(setCookieFor(hop, FLASH)).toBeUndefined();
  });
});

describe('the form submitted (register)', () => {
  const submit = (browser: Browser, slug: string, confirm: string | null) => {
    const body = new FormData();
    if (confirm !== null) body.append('confirm', confirm);
    return browser.post(`/tournament/${slug}/register/submit`, body);
  };

  it("unconfirmed: back to the form with sportbet's message, and nothing joined", async () => {
    const browser = await jonasInSooner();
    const page = await submit(browser, LATER.tournament.slug, null);
    expect(page.status).toBe(303);
    expect(page.location).toBe(`/tournament/${LATER.tournament.slug}/register`);
    const form = await browser.get(page.location ?? '');
    expect(documentOf(form).querySelector('[role="alert"]')?.textContent).toBe(
      'Patvirtinkite, kad norite dalyvauti šiame turnyre.',
    );
    expect(await rows('tournament_players', LATER.id)).toBe(0);
  });

  it('confirmed: joins (a place, a blank row per game, a standings row per team), makes it the last used, and goes home with "Užsiregistravote į turnyrą: ..." shown once', async () => {
    const browser = await jonasInSooner();
    const page = await submit(browser, LATER.tournament.slug, '1');
    expect(page.status).toBe(303);
    expect(page.location).toBe('/');
    expect(await rows('tournament_players', LATER.id)).toBe(1);
    expect(await rows('match_predictions', LATER.id)).toBe(2);
    expect(await rows('standings_predictions', LATER.id)).toBe(2);
    expect(await lastTournament()).toBe(LATER.id);
    const home = await browser.get('/');
    expect(documentOf(home).querySelector('[role="status"]')?.textContent).toBe(
      `Užsiregistravote į turnyrą: ${LATER.tournament.name}`,
    );
    const again = await browser.get('/');
    expect(documentOf(again).querySelector('[role="status"]')).toBeNull();
  });

  // Slice 8 moves the player's home to /main: the message must still show
  // on the page the submit sends the player to.
  it("confirmed: the message shows on the player's home, whatever path that is", async () => {
    const browser = await jonasInSooner();
    const page = await submit(browser, LATER.tournament.slug, '1');
    expect(page.location).toBe(PLAYER_HOME);
    const home = await browser.get(PLAYER_HOME);
    expect(home.status).toBe(200);
    expect(documentOf(home).querySelector('[role="status"]')?.textContent).toBe(
      `Užsiregistravote į turnyrą: ${LATER.tournament.name}`,
    );
  });

  it('submitted twice, joins once', async () => {
    const browser = await jonasInSooner();
    await submit(browser, LATER.tournament.slug, '1');
    await submit(browser, LATER.tournament.slug, '1');
    expect(await rows('tournament_players', LATER.id)).toBe(1);
    expect(await rows('match_predictions', LATER.id)).toBe(2);
  });

  it('closed meanwhile: home with the closed message, nothing joined', async () => {
    const browser = await jonasInSooner();
    await saveTournamentWithGames(db, CLOSED);
    await withProfile(db, CLOSED.tournament.slug, ACTIVE_PROFILE);
    const page = await submit(browser, CLOSED.tournament.slug, '1');
    expect(page.location).toBe('/');
    expect(await rows('tournament_players', CLOSED.id)).toBe(0);
    const home = await browser.get('/');
    expect(documentOf(home).querySelector('[role="alert"]')?.textContent).toBe(
      'Registracija į šį turnyrą jau pasibaigė.',
    );
  });

  it('a player already in it, after the close too, is taken in with the message, as sportbet lets a member resubmit', async () => {
    const browser = await jonasInSooner();
    await saveTournamentWithGames(db, CLOSED);
    await withProfile(db, CLOSED.tournament.slug, ACTIVE_PROFILE);
    await client.query(
      'insert into tournament_players (tournament_id, player_id, switched_off, admin_hidden, fill_ins) values ($1, 1, false, false, 0)',
      [CLOSED.id],
    );
    const page = await submit(browser, CLOSED.tournament.slug, '1');
    expect(page.location).toBe('/');
    expect(await lastTournament()).toBe(CLOSED.id);
  });

  it('a guest is sent to sign in, back to the form after', async () => {
    await saveTournamentWithGames(db, LATER);
    const page = await submit(
      new Browser(baseUrl, '192.0.2.53'),
      LATER.tournament.slug,
      '1',
    );
    expect(page.location).toBe(
      `/login?intended=%2Ftournament%2F${LATER.tournament.slug}%2Fregister`,
    );
  });

  it('a POST from another site is refused, and nothing is joined', async () => {
    const browser = await jonasInSooner();
    const body = new FormData();
    body.append('confirm', '1');
    const page = await browser.post(
      `/tournament/${LATER.tournament.slug}/register/submit`,
      body,
      { origin: 'https://evil.example' },
    );
    expect(page.status).toBe(403);
    expect(await rows('tournament_players', LATER.id)).toBe(0);
  });

  it('a POST with no Origin and no Sec-Fetch-Site is refused', async () => {
    const browser = await jonasInSooner();
    const body = new FormData();
    body.append('confirm', '1');
    const page = await browser.post(
      `/tournament/${LATER.tournament.slug}/register/submit`,
      body,
      { origin: null },
    );
    expect(page.status).toBe(403);
  });

  it('a non-public tournament is not found for a player not in it (R-50)', async () => {
    const browser = await jonasInSooner();
    await withProfile(db, LATER.tournament.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    expect((await submit(browser, LATER.tournament.slug, '1')).status).toBe(
      404,
    );
    expect(
      (await browser.get(`/tournament/${LATER.tournament.slug}/register`))
        .status,
    ).toBe(404);
  });
});
