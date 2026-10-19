import { insertTournamentPlayer, useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import {
  JONAS_ACCOUNT,
  saveAccounts,
  ZUKAUSKAS_ACCOUNT,
} from '../support/accounts';
import { Browser, documentOf, type Page } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { jonasPlaying } from '../support/predictions';
import { SOONER } from '../support/registration';

// Slice 10 (#27): the survival page at sportbet's URL, its pick save
// (updatePredictionSurvivalUser, at /prediction/predictionSurvival/save -
// Next serves no page and handler at one path) and the survival summary,
// against the built app. SOONER (41) has teams 411 and 412, round 1 (411)
// with their one game a week off and round 5 (415); here round 1 plays
// survival in a tournament that does.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PAGE = '/prediction/predictionSurvival';
const SAVE = '/prediction/predictionSurvival/save';
const SUMMARY = '/summary/predictionSurvivals';

const json = (page: Page): unknown => JSON.parse(page.html);

const pick = (fields: Readonly<Record<string, string>>) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return body;
};

const picks = async () =>
  z
    .array(
      z.object({ player_id: z.int(), round_id: z.int(), team_id: z.int() }),
    )
    .parse(
      (
        await client.query(
          'select player_id, round_id, team_id from survival_picks order by player_id, round_id',
        )
      ).rows,
    );

/** Jonas playing SOONER, its round 1 a survival round of a survival tournament. */
const surviving = async () => {
  const browser = await jonasPlaying(db, client, baseUrl, SOONER);
  await client.query('update tournaments set survival = true where id = 41');
  await client.query('update rounds set survival = true where id = 411');
  return browser;
};

const refused = (message: string) => ({ success: false, message });

describe('POST /prediction/predictionSurvival/save (updatePredictionSurvivalUser)', () => {
  it('accepted: 200 {success: true}, one pick; a switch within the round keeps one row', async () => {
    const browser = await surviving();
    const first = await browser.post(SAVE, pick({ teamID: '411', round: '1' }));
    expect(first.status).toBe(200);
    expect(json(first)).toEqual({ success: true });
    expect(await picks()).toEqual([
      { player_id: 1, round_id: 411, team_id: 411 },
    ]);
    const second = await browser.post(
      SAVE,
      pick({ teamID: '412', round: '1' }),
    );
    expect(second.status).toBe(200);
    expect(await picks()).toEqual([
      { player_id: 1, round_id: 411, team_id: 412 },
    ]);
  });

  it('a post that names no round is judged on the current one', async () => {
    const browser = await surviving();
    const page = await browser.post(SAVE, pick({ teamID: '411', round: '' }));
    expect(page.status).toBe(200);
  });

  it.each([
    [{ teamID: '', round: '1' }, 'Nepasirinkta komanda.'],
    [{ teamID: 'abc', round: '1' }, 'Ši komanda nepasiekiama.'],
    [{ teamID: '411', round: 'x' }, 'Turas pasikeitė - perkraukite puslapį.'],
  ])('the form refuses %o: 422 "%s", nothing written', async (fields, text) => {
    const browser = await surviving();
    const page = await browser.post(SAVE, pick(fields));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(refused(text));
    expect(await picks()).toEqual([]);
  });

  it('a team not stored, or of a tournament the player is not in: "Ši komanda nepasiekiama."', async () => {
    const browser = await surviving();
    const page = await browser.post(SAVE, pick({ teamID: '999', round: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(refused('Ši komanda nepasiekiama.'));
  });

  it('a page that showed another round: "Turas pasikeitė - perkraukite puslapį."', async () => {
    const browser = await surviving();
    const page = await browser.post(SAVE, pick({ teamID: '411', round: '5' }));
    expect(json(page)).toEqual(
      refused('Turas pasikeitė - perkraukite puslapį.'),
    );
  });

  it('a tournament that plays no survival: "Šiame ture išlikimo žaidimo nėra."', async () => {
    const browser = await surviving();
    await client.query('update tournaments set survival = false where id = 41');
    const page = await browser.post(SAVE, pick({ teamID: '411', round: '1' }));
    expect(json(page)).toEqual(refused('Šiame ture išlikimo žaidimo nėra.'));
  });

  it('R-81: a team with no game in the round: "Ši komanda šiame ture nežaidžia."', async () => {
    const browser = await surviving();
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (413, 41, 'Komanda 413')",
    );
    const page = await browser.post(SAVE, pick({ teamID: '413', round: '1' }));
    expect(json(page)).toEqual(refused('Ši komanda šiame ture nežaidžia.'));
  });

  it('a team whose game has tipped off: "Šios komandos rungtynės jau prasidėjo."', async () => {
    const browser = await surviving();
    // Round 1 keeps an open game (413 v 414), so it stays the current
    // round (LR-3: the soonest open game's) once 411's game has started.
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (413, 41, 'Komanda 413'), (414, 41, 'Komanda 414')",
    );
    await client.query(
      "insert into games (id, tournament_id, round_id, home_team_id, away_team_id, tip_off) overriding system value values (416, 41, 411, 413, 414, date_trunc('second', now()) + interval '1 day')",
    );
    await client.query(
      "update games set tip_off = date_trunc('second', now()) - interval '1 minute' where id = 411",
    );
    const page = await browser.post(SAVE, pick({ teamID: '411', round: '1' }));
    expect(json(page)).toEqual(
      refused('Šios komandos rungtynės jau prasidėjo.'),
    );
    expect(await picks()).toEqual([]);
  });

  /** Round 1 keeps an open game (413 v 414, tomorrow), so it stays current. */
  const roundOneKeptOpen = async () => {
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (413, 41, 'Komanda 413'), (414, 41, 'Komanda 414')",
    );
    await client.query(
      "insert into games (id, tournament_id, round_id, home_team_id, away_team_id, tip_off) overriding system value values (416, 41, 411, 413, 414, date_trunc('second', now()) + interval '1 day')",
    );
  };

  it('no game to pick for: "Šiuo metu nėra raundo, kuriam būtų galima rinktis."', async () => {
    const browser = await surviving();
    // Under the ruled rules a played season keeps its last round current
    // (LR-3, R-40), so only a tournament with no game has none.
    for (const table of [
      'match_points',
      'game_odds',
      'audit_prediction_games',
      'match_predictions',
    ]) {
      await client.query(
        `delete from ${table} where game_id in (select id from games where tournament_id = 41)`,
      );
    }
    await client.query('delete from games where tournament_id = 41');
    const page = await browser.post(SAVE, pick({ teamID: '411', round: '' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(
      refused('Šiuo metu nėra raundo, kuriam būtų galima rinktis.'),
    );
    expect(await picks()).toEqual([]);
  });

  it('a round whose pick is scored: "Šis turas jau užskaitytas."', async () => {
    const browser = await surviving();
    await roundOneKeptOpen();
    expect(
      (await browser.post(SAVE, pick({ teamID: '411', round: '1' }))).status,
    ).toBe(200);
    await client.query(
      "update games set tip_off = date_trunc('second', now()) - interval '1 day', home_score = 80, away_score = 70, recorded_winner_id = 411 where id = 411",
    );
    const page = await browser.post(SAVE, pick({ teamID: '413', round: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(refused('Šis turas jau užskaitytas.'));
    expect(await picks()).toEqual([
      { player_id: 1, round_id: 411, team_id: 411 },
    ]);
  });

  it('R-4: a pick whose game has tipped off: "Tavo pasirinktos komandos rungtynės jau prasidėjo - ..."', async () => {
    const browser = await surviving();
    await roundOneKeptOpen();
    expect(
      (await browser.post(SAVE, pick({ teamID: '411', round: '1' }))).status,
    ).toBe(200);
    await client.query(
      "update games set tip_off = date_trunc('second', now()) - interval '1 minute' where id = 411",
    );
    const page = await browser.post(SAVE, pick({ teamID: '413', round: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(
      refused(
        'Tavo pasirinktos komandos rungtynės jau prasidėjo - šio turo pasirinkimo keisti nebegalima.',
      ),
    );
    expect(await picks()).toEqual([
      { player_id: 1, round_id: 411, team_id: 411 },
    ]);
  });

  it('R-11: a team used earlier in the run: "Šią komandą jau rinkaisi - ...", the other one taken', async () => {
    const browser = await surviving();
    await client.query('update rounds set survival = true where id = 415');
    expect(
      (await browser.post(SAVE, pick({ teamID: '411', round: '1' }))).status,
    ).toBe(200);
    // 411 wins round 1, so round 5 is current and 411 is spent (1 of 2 teams).
    await client.query(
      "update games set tip_off = date_trunc('second', now()) - interval '1 day', home_score = 80, away_score = 70, recorded_winner_id = 411 where id = 411",
    );
    const used = await browser.post(SAVE, pick({ teamID: '411', round: '5' }));
    expect(used.status).toBe(422);
    expect(json(used)).toEqual(
      refused(
        'Šią komandą jau rinkaisi - kiekvieną komandą galima rinktis tik kartą, kol išnaudosi visas.',
      ),
    );
    const free = await browser.post(SAVE, pick({ teamID: '412', round: '5' }));
    expect(free.status).toBe(200);
    expect(await picks()).toEqual([
      { player_id: 1, round_id: 411, team_id: 411 },
      { player_id: 1, round_id: 415, team_id: 412 },
    ]);
  });

  it("the 61st accepted save within a minute is 429 with the throttle's text; a refused form does not count", async () => {
    const browser = await surviving();
    for (let save = 0; save < 5; save += 1) {
      expect(
        (await browser.post(SAVE, pick({ teamID: '', round: '1' }))).status,
      ).toBe(422);
    }
    for (let save = 0; save < 60; save += 1) {
      const team = save % 2 === 0 ? '411' : '412';
      expect(
        (await browser.post(SAVE, pick({ teamID: team, round: '1' }))).status,
      ).toBe(200);
    }
    const page = await browser.post(SAVE, pick({ teamID: '411', round: '1' }));
    expect(page.status).toBe(429);
    expect(json(page)).toEqual(
      refused('Per daug bandymų. Pabandykite dar kartą po 1 min.'),
    );
    expect(await picks()).toEqual([
      { player_id: 1, round_id: 411, team_id: 412 },
    ]);
  }, 60_000);

  it('a save that waits past the 5 s lock_timeout is a 503 in the survival line, not a 500', async () => {
    const browser = await surviving();
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select 1 from games where id = 411 for update');
      const page = await browser.post(
        SAVE,
        pick({ teamID: '411', round: '1' }),
      );
      expect(page.status).toBe(503);
      expect(json(page)).toEqual(
        refused('Pasirinkimas neišsaugotas. Bandykite dar kartą.'),
      );
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await picks()).toEqual([]);
  }, 30_000);

  it('a guest gets 401 {"message":"Unauthenticated."}; another site 403, nothing written', async () => {
    const guest = await new Browser(baseUrl, '192.0.2.93').post(
      SAVE,
      pick({ teamID: '411', round: '1' }),
    );
    expect(guest.status).toBe(401);
    expect(json(guest)).toEqual({ message: 'Unauthenticated.' });
    const browser = await surviving();
    const crossSite = await browser.post(
      SAVE,
      pick({ teamID: '411', round: '1' }),
      {
        origin: 'https://evil.example',
      },
    );
    expect(crossSite.status).toBe(403);
    expect(await picks()).toEqual([]);
  });
});

describe('GET /prediction/predictionSurvival', () => {
  it('a guest is sent to sign in, to come back here', async () => {
    const page = await new Browser(baseUrl, '192.0.2.94').get(PAGE);
    expect(page.status).toBe(307);
    expect(page.location).toBe(`/login?intended=${encodeURIComponent(PAGE)}`);
  });

  it('a player in no tournament goes to the front page', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const page = await browser.get(PAGE);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it('a player: the round\'s two teams to choose from, the stake "+20/24" (R-138: sportbet\'s 10/12 doubled), the rules; "Išlikimas" in the navigation', async () => {
    const browser = await surviving();
    const document = documentOf(await browser.get(PAGE));
    const radios = document.querySelectorAll(
      '[role="radiogroup"] input[type="radio"]',
    );
    expect(Array.from(radios, (radio) => radio.getAttribute('value'))).toEqual([
      '411',
      '412',
    ]);
    for (const radio of radios)
      expect(radio.hasAttribute('disabled')).toBe(false);
    expect(
      document.querySelector('[data-testid="survival-stake"]')?.textContent,
    ).toBe('+20/24');
    expect(document.body.textContent).toContain('1 turas · Rinkis komandą');
    expect(document.body.textContent).toContain('Taisyklės');
    expect(document.body.textContent).toContain(
      'namie gauni 20, išvykoje 24 taškų',
    );
    expect(document.querySelector(`a[href="${PAGE}"]`)?.textContent).toContain(
      'Išlikimas',
    );
  });

  it('the held pick is checked after a reload', async () => {
    const browser = await surviving();
    await browser.post(SAVE, pick({ teamID: '412', round: '1' }));
    const document = documentOf(await browser.get(PAGE));
    expect(
      document
        .querySelector('input[type="radio"][value="412"]')
        ?.hasAttribute('checked'),
    ).toBe(true);
  });

  it('a round without survival: "Išlikimo žaidimas baigėsi.", and no entry', async () => {
    const browser = await surviving();
    await client.query('update rounds set survival = false where id = 411');
    const document = documentOf(await browser.get(PAGE));
    expect(document.body.textContent).toContain('Išlikimo žaidimas baigėsi.');
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
    expect(document.querySelector(`a[href="${PAGE}"]`)).toBeNull();
  });
});

describe('GET /summary/predictionSurvivals', () => {
  it('a guest is sent to sign in, to come back here', async () => {
    const page = await new Browser(baseUrl, '192.0.2.95').get(SUMMARY);
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=${encodeURIComponent(SUMMARY)}`,
    );
  });

  it('a player in no tournament goes to the front page', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const page = await browser.get(SUMMARY);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it('a tournament that plays no survival goes to the front page', async () => {
    const browser = await surviving();
    await client.query('update tournaments set survival = false where id = 41');
    const page = await browser.get(SUMMARY);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it('every listed player\'s row; the viewer sees their own pick, another\'s pending pick reads "Pasirinkta" (R-82); no surname', async () => {
    const browser = await surviving();
    await saveAccounts(db, [ZUKAUSKAS_ACCOUNT]);
    await insertTournamentPlayer(client, { tournament: 41, player: 2 });
    await browser.post(SAVE, pick({ teamID: '411', round: '1' }));
    await client.query(
      'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (2, 41, 411, 412)',
    );
    const document = documentOf(await browser.get(SUMMARY));
    const rows = Array.from(
      document.querySelectorAll('[data-testid="survival-row"]'),
    );
    expect(rows).toHaveLength(2);
    const rowOf = (username: string) =>
      rows.find((row) => row.textContent.includes(username));
    const titleIn = (username: string) =>
      rowOf(username)
        ?.querySelector('[data-testid="survival-tile"]')
        ?.getAttribute('title');
    expect(rowOf('jonas')?.getAttribute('data-me')).toBe('true');
    expect(titleIn('jonas')).toBe('1 turas · Home 41 · dar nežinoma');
    expect(titleIn('zuk')).toBe('1 turas · Pasirinkta · dar nežinoma');
    expect(document.body.textContent).not.toContain('Petraitis');
    expect(document.body.textContent).not.toContain('Žukauskas');
  });

  it('no survival round yet: "Išlikimo turų šiame turnyre dar nėra."', async () => {
    const browser = await surviving();
    await client.query('update rounds set survival = false where id = 411');
    const document = documentOf(await browser.get(SUMMARY));
    expect(document.body.textContent).toContain(
      'Išlikimo turų šiame turnyre dar nėra.',
    );
  });
});
