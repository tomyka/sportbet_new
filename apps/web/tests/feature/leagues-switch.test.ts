import { insertTournamentPlayer, useTestDatabase } from '@sportbet/db/testing';
import { emailAddress, type StoredPlayer } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import {
  LEAGUE_SWITCH_PATH,
  PLAYER_HOME,
} from '../../src/components/shell/shell-paths';
import {
  JONAS_ACCOUNT,
  saveAccounts,
  ZUKAUSKAS_ACCOUNT,
} from '../support/accounts';
import { Browser, documentOf, type Page } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { savePlaying } from '../support/predictions';
import { CLOSED } from '../support/registration';

// /leagues/switch (slice 12a, #29): LeagueController::switchLeague, and the
// tables it narrows (R-73), against the built app. In CLOSED (43) Jonas (1),
// Žukauskas (2) and Trečias (3) all play; the private league 900 holds Jonas
// and Trečias in full and Žukauskas as a guest, so a full member sees Jonas
// and Trečias there and the guest sees all three. League 901 holds only
// Žukauskas.

const TRECIAS_ACCOUNT: StoredPlayer = {
  id: player('3'),
  username: 'trecias',
  email: unwrap(emailAddress('trecias@example.lt')),
  name: 'Trečias',
  surname: 'Trečiauskas',
};

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PRIVATE = 900;
const OTHERS = 901;
const REFERER = `${baseUrl}/summary/chart`;

/** Jonas and Žukauskas signed in, the three playing CLOSED and the private leagues set up; everyone still selects the public league. */
async function leaguesSetUp(): Promise<{
  readonly jonas: Browser;
  readonly guest: Browser;
}> {
  const jonas = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
  await savePlaying(db, client, CLOSED);
  const guest = await signedInBrowser(db, baseUrl, ZUKAUSKAS_ACCOUNT, {
    ip: '192.0.2.41',
  });
  await saveAccounts(db, [TRECIAS_ACCOUNT]);
  for (const id of [2, 3]) {
    await insertTournamentPlayer(client, { tournament: CLOSED.id, player: id });
  }
  for (const [id, name] of [
    [PRIVATE, 'Draugų lyga'],
    [OTHERS, 'Svetimų lyga'],
  ] as const) {
    await client.query(
      'insert into leagues (id, tournament_id, name, is_public) overriding system value values ($1, $2, $3, false)',
      [id, CLOSED.id, name],
    );
  }
  for (const [league, id, isGuest] of [
    [PRIVATE, 1, false],
    [PRIVATE, 2, true],
    [PRIVATE, 3, false],
    [OTHERS, 2, false],
  ] as const) {
    await client.query(
      'insert into league_members (league_id, player_id, is_guest) values ($1, $2, $3)',
      [league, id, isGuest],
    );
  }
  return { jonas, guest };
}

const switchBody = (league: string): FormData => {
  const body = new FormData();
  body.set('leagueID', league);
  return body;
};

/** The usernames in the game page's table, sorted. */
const tableOf = (page: Page): string[] =>
  [...documentOf(page).querySelectorAll('[data-testid="lb-row"]')]
    .flatMap((row) =>
      ['jonas', 'zuk', 'trecias'].filter((name) =>
        row.textContent.includes(name),
      ),
    )
    .sort();

const alertOn = (page: Page): string | null =>
  documentOf(page).querySelector('[role="status"]')?.textContent ?? null;

/** The league a player's tables show in CLOSED. */
async function selected(id: number): Promise<number> {
  const { rows } = await client.query(
    'select selected_league_id from tournament_players where player_id = $1 and tournament_id = $2',
    [id, CLOSED.id],
  );
  const [row] = z.array(z.object({ selected_league_id: z.int() })).parse(rows);
  return row?.selected_league_id ?? 0;
}

describe('POST /leagues/switch (LeagueController::switchLeague)', () => {
  it('a member switches: a 303 back to the page they came from, the table narrows to the league, and "Lyga pakeista" shows once', async () => {
    const { jonas } = await leaguesSetUp();
    expect(tableOf(await jonas.get(PLAYER_HOME))).toEqual([
      'jonas',
      'trecias',
      'zuk',
    ]);
    const answer = await jonas.post(
      LEAGUE_SWITCH_PATH,
      switchBody(String(PRIVATE)),
      { referer: REFERER },
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe('/summary/chart');
    expect(await selected(1)).toBe(PRIVATE);
    const home = await jonas.get(PLAYER_HOME);
    expect(alertOn(home)).toBe('Lyga pakeista');
    expect(tableOf(home)).toEqual(['jonas', 'trecias']);
    expect(alertOn(await jonas.get(PLAYER_HOME))).toBeNull();
  });

  it('with no Referer it goes to the game page', async () => {
    const { jonas } = await leaguesSetUp();
    const answer = await jonas.post(
      LEAGUE_SWITCH_PATH,
      switchBody(String(PRIVATE)),
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe(PLAYER_HOME);
  });

  it("a guest of the league sees every member in its table, and the switcher lists the player's leagues (R-73)", async () => {
    const { guest } = await leaguesSetUp();
    await guest.post(LEAGUE_SWITCH_PATH, switchBody(String(PRIVATE)));
    const home = await guest.get(PLAYER_HOME);
    expect(tableOf(home)).toEqual(['jonas', 'trecias', 'zuk']);
    const offered = [
      ...documentOf(home).querySelectorAll(
        `form[action="${LEAGUE_SWITCH_PATH}"]`,
      ),
    ]
      .map((form) => form.textContent)
      .join('|');
    expect(offered).toContain('Svetimų lyga');
    expect(offered).toContain(CLOSED.tournament.name);
  });

  it('a league the player is not a member of is not found, and nothing changes', async () => {
    const { jonas } = await leaguesSetUp();
    const before = await selected(1);
    const answer = await jonas.post(
      LEAGUE_SWITCH_PATH,
      switchBody(String(OTHERS)),
    );
    expect(answer.status).toBe(404);
    expect(await selected(1)).toBe(before);
  });

  it.each(['', 'abc', '1.5', '007'])(
    "a malformed leagueID %j is Laravel's 422 answer, and nothing changes",
    async (typed) => {
      const { jonas } = await leaguesSetUp();
      const before = await selected(1);
      const answer = await jonas.post(LEAGUE_SWITCH_PATH, switchBody(typed));
      expect(answer.status).toBe(422);
      expect(JSON.parse(answer.html)).toMatchObject({
        errors: { leagueID: [expect.any(String)] },
      });
      expect(await selected(1)).toBe(before);
    },
  );

  it.each(['0', '-1', '99999999999'])(
    'the integer %j names no league: not found, as firstOrFail finds none',
    async (typed) => {
      const { jonas } = await leaguesSetUp();
      const answer = await jonas.post(LEAGUE_SWITCH_PATH, switchBody(typed));
      expect(answer.status).toBe(404);
    },
  );

  it('no leagueID at all is refused as required', async () => {
    const { jonas } = await leaguesSetUp();
    const answer = await jonas.post(LEAGUE_SWITCH_PATH, new FormData());
    expect(answer.status).toBe(422);
    expect(JSON.parse(answer.html)).toMatchObject({
      message: 'The league i d field is required.',
    });
  });

  it('a post from another site is a 403, and nothing changes', async () => {
    const { jonas } = await leaguesSetUp();
    const before = await selected(1);
    const answer = await jonas.post(
      LEAGUE_SWITCH_PATH,
      switchBody(String(PRIVATE)),
      { origin: 'https://evil.example' },
    );
    expect(answer.status).toBe(403);
    expect(await selected(1)).toBe(before);
  });

  it('a guest is sent to sign in', async () => {
    await leaguesSetUp();
    const answer = await new Browser(baseUrl, '192.0.2.62').post(
      LEAGUE_SWITCH_PATH,
      switchBody(String(PRIVATE)),
    );
    expect(answer.status).toBe(303);
    expect(answer.location).toBe('/login');
  });
});
