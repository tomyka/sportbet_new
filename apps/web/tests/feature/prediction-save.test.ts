import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { saveAccounts, ZUKAUSKAS_ACCOUNT } from '../support/accounts';
import { Browser, type Page } from '../support/browser';
import { gamesOf, jonasPlaying } from '../support/predictions';
import {
  CLOSED,
  LATER,
  saveTournamentWithGames,
  SOONER,
} from '../support/registration';

// The save (slice 6b, #20): updatePredictionResultUser behind
// UpdatePredictionResultRequest, against the built app, at
// POST /prediction/results/save (decision 1).

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const SAVE = '/prediction/results/save';
const [OPEN_GAME, NEXT_ROUND] = gamesOf(SOONER);
const [STARTED] = gamesOf(CLOSED);

const pair = (game: number, home: string, away: string, row = game) => {
  const body = new FormData();
  body.set('gameID', String(game));
  body.set('prediction_gameID', String(row));
  body.set('homeTeamScore', home);
  body.set('awayTeamScore', away);
  return body;
};

const json = (page: Page): unknown => JSON.parse(page.html);

const rowOf = async (game: number) =>
  z
    .array(z.object({ home: z.int().nullable(), away: z.int().nullable() }))
    .parse(
      (
        await client.query(
          'select home, away from match_predictions where player_id = 1 and game_id = $1',
          [game],
        )
      ).rows,
    )[0];

const audited = async () =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (
        await client.query(
          'select count(*)::int as rows from audit_prediction_games',
        )
      ).rows,
    )[0]?.rows;

const jonas = () => jonasPlaying(db, client, baseUrl, SOONER, CLOSED);

describe('POST /prediction/results/save (updatePredictionResultUser)', () => {
  it("saved: 200 with sportbet's odds and the panel, from Jonas's one vote now", async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(OPEN_GAME, '88', '79'));
    expect(page.status).toBe(200);
    // One home vote: home log2(1/1) = 0, away and draw log2(1/0.5) = 1.
    expect(json(page)).toEqual({
      success: true,
      home_odds: 0,
      draw_odds: 1,
      away_odds: 1,
      panel: { home: '50.0', away: '100.0', draw: '100.0' },
    });
    expect(await rowOf(OPEN_GAME)).toEqual({ home: 88, away: 79 });
    expect(await audited()).toBe(1);
  });

  it('cleared: 200, the row blank again, nothing audited', async () => {
    const browser = await jonas();
    await browser.post(SAVE, pair(OPEN_GAME, '88', '79'));
    const page = await browser.post(SAVE, pair(OPEN_GAME, '', ''));
    expect(page.status).toBe(200);
    expect(await rowOf(OPEN_GAME)).toEqual({ home: null, away: null });
    expect(await audited()).toBe(1);
  });

  it('a side out of range, or no whole number: 422 with the range message on its field', async () => {
    const browser = await jonas();
    for (const bad of ['130', '49', 'abc', '8.5']) {
      const page = await browser.post(SAVE, pair(OPEN_GAME, bad, '79'));
      expect(page.status).toBe(422);
      expect(json(page)).toEqual({
        message: 'Rezultatas turi būti nuo 50 iki 120.',
        errors: { homeTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'] },
      });
    }
    expect(await rowOf(OPEN_GAME)).toEqual({ home: null, away: null });
  });

  it('both sides out of range: both fields, and "(and 1 more error)"', async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(OPEN_GAME, '130', '20'));
    expect(json(page)).toEqual({
      message: 'Rezultatas turi būti nuo 50 iki 120. (and 1 more error)',
      errors: {
        homeTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
        awayTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
      },
    });
  });

  it('R-15: one side alone is "Įveskite abu rezultatus." on the blank one', async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(OPEN_GAME, '88', ''));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      message: 'Įveskite abu rezultatus.',
      errors: { awayTeamScore: ['Įveskite abu rezultatus.'] },
    });
  });

  it('a level pair: "no draws" on the home field', async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(OPEN_GAME, '80', '80'));
    expect(json(page)).toEqual({
      message: 'Lygiosios negalimos - komandų rezultatai turi skirtis.',
      errors: {
        homeTeamScore: [
          'Lygiosios negalimos - komandų rezultatai turi skirtis.',
        ],
      },
    });
  });

  it('issue 254: a game Jonas has no row of is "Šios prognozės išsaugoti negalima."', async () => {
    const browser = await jonas();
    await saveTournamentWithGames(db, LATER);
    const [notHis] = gamesOf(LATER);
    const page = await browser.post(SAVE, pair(notHis, '88', '79'));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      success: false,
      message: 'Šios prognozės išsaugoti negalima.',
    });
  });

  it("issue 254: gameID must name the row's game; neither row is written", async () => {
    const browser = await jonas();
    const page = await browser.post(
      SAVE,
      pair(OPEN_GAME, '88', '79', NEXT_ROUND),
    );
    expect(json(page)).toEqual({
      success: false,
      message: 'Šios prognozės išsaugoti negalima.',
    });
    expect(await rowOf(OPEN_GAME)).toEqual({ home: null, away: null });
    expect(await rowOf(NEXT_ROUND)).toEqual({ home: null, away: null });
  });

  it('an id past Postgres\' integer (games.id) is "not yours", never a 500 (security review)', async () => {
    const browser = await jonas();
    for (const id of [2147483648, 9999999999]) {
      const page = await browser.post(SAVE, pair(id, '88', '79'));
      expect(page.status).toBe(422);
      expect(json(page)).toEqual({
        success: false,
        message: 'Šios prognozės išsaugoti negalima.',
      });
    }
  });

  it('a missing gameID is "not yours" too (decision 7)', async () => {
    const browser = await jonas();
    const body = pair(OPEN_GAME, '88', '79');
    body.delete('gameID');
    expect(json(await browser.post(SAVE, body))).toEqual({
      success: false,
      message: 'Šios prognozės išsaugoti negalima.',
    });
  });

  it('LR-1: a started game is "Šio mačo prognozuoti nebegalima.", and its row is not touched', async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(STARTED, '88', '79'));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      success: false,
      message: 'Šio mačo prognozuoti nebegalima.',
    });
    expect(await rowOf(STARTED)).toEqual({ home: null, away: null });
  });

  it('R-7, R-57: a saved score switches Jonas back on in that tournament; a clear does not', async () => {
    const browser = await jonas();
    await client.query(
      'update tournament_players set switched_off = true, fill_ins = 20 where player_id = 1 and tournament_id = $1',
      [SOONER.id],
    );
    const status = async () =>
      z
        .array(z.object({ switched_off: z.boolean(), fill_ins: z.int() }))
        .parse(
          (
            await client.query(
              'select switched_off, fill_ins from tournament_players where player_id = 1 and tournament_id = $1',
              [SOONER.id],
            )
          ).rows,
        )[0];
    await browser.post(SAVE, pair(OPEN_GAME, '', ''));
    expect(await status()).toEqual({ switched_off: true, fill_ins: 20 });
    await browser.post(SAVE, pair(OPEN_GAME, '88', '79'));
    expect(await status()).toEqual({ switched_off: false, fill_ins: 0 });
  });

  it("saves the session's player's row only: a body naming another player is ignored (security review)", async () => {
    const browser = await jonas();
    await saveAccounts(db, [ZUKAUSKAS_ACCOUNT]);
    await client.query(
      "insert into match_predictions (player_id, game_id, origin) values (2, $1, 'real')",
      [OPEN_GAME],
    );
    const body = pair(OPEN_GAME, '88', '79');
    for (const field of [
      'player',
      'player_id',
      'playerID',
      'user_id',
      'userID',
    ]) {
      body.set(field, '2');
    }
    expect((await browser.post(SAVE, body)).status).toBe(200);
    expect(await rowOf(OPEN_GAME)).toEqual({ home: 88, away: 79 });
    const his = await client.query(
      'select home, away from match_predictions where player_id = 2 and game_id = $1',
      [OPEN_GAME],
    );
    expect(his.rows).toEqual([{ home: null, away: null }]);
  });

  it('a post the form refuses does not count: after 60 of them a save is still accepted', async () => {
    const browser = await jonas();
    const refused = [
      pair(OPEN_GAME, '130', '79'),
      pair(OPEN_GAME, '88', ''),
      pair(OPEN_GAME, '80', '80'),
    ];
    for (let post = 0; post < 60; post += 1) {
      const page = await browser.post(
        SAVE,
        refused[post % 3] ?? pair(OPEN_GAME, '1', '1'),
      );
      expect(page.status).toBe(422);
    }
    expect((await browser.post(SAVE, pair(OPEN_GAME, '88', '79'))).status).toBe(
      200,
    );
    expect(await rowOf(OPEN_GAME)).toEqual({ home: 88, away: 79 });
  });

  it("the 61st save within a minute is 429 with the throttle's text, and writes nothing", async () => {
    const browser = await jonas();
    for (let save = 0; save < 60; save += 1) {
      expect(
        (await browser.post(SAVE, pair(OPEN_GAME, '88', '79'))).status,
      ).toBe(200);
    }
    const page = await browser.post(SAVE, pair(OPEN_GAME, '90', '79'));
    expect(page.status).toBe(429);
    expect(json(page)).toEqual({
      success: false,
      message: 'Per daug bandymų. Pabandykite dar kartą po 1 min.',
    });
    expect(await rowOf(OPEN_GAME)).toEqual({ home: 88, away: 79 });
  });

  it('a POST from another site is refused, and nothing is written (#16)', async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(OPEN_GAME, '88', '79'), {
      origin: 'https://evil.example',
    });
    expect(page.status).toBe(403);
    expect(await rowOf(OPEN_GAME)).toEqual({ home: null, away: null });
  });

  it('a guest gets 401 {"message":"Unauthenticated."} (decision 8)', async () => {
    const page = await new Browser(baseUrl, '192.0.2.70').post(
      SAVE,
      pair(OPEN_GAME, '88', '79'),
    );
    expect(page.status).toBe(401);
    expect(json(page)).toEqual({ message: 'Unauthenticated.' });
  });
});
