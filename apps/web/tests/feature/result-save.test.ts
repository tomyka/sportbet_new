import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser, type Page } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { gamesOf, savePlaying } from '../support/predictions';
import {
  CLOSED,
  saveTournamentWithGames,
  SOONER,
} from '../support/registration';

// POST /admin/updateResult (slice 7b, #21): ResultController::updateResult
// behind UpdateResultRequest and AdminMiddleware, against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PATH = '/admin/updateResult';
const [STARTED] = gamesOf(CLOSED);
const [FUTURE] = gamesOf(SOONER);

const boxes = (game: number, home: string, away: string) => {
  const body = new FormData();
  body.set('gameID', String(game));
  body.set('homeTeamScore', home);
  body.set('awayTeamScore', away);
  return body;
};

const json = (page: Page): unknown => JSON.parse(page.html);

const scoreOf = async (game: number) =>
  z
    .array(z.object({ home_score: z.int().nullable(), postponed: z.boolean() }))
    .parse(
      (
        await client.query(
          'select home_score, postponed from games where id = $1',
          [game],
        )
      ).rows,
    )[0];

const manager = async () => {
  const browser = await signedInBrowser(
    db,
    baseUrl,
    JONAS_ACCOUNT,
    'results-manager',
  );
  await savePlaying(db, client, SOONER, CLOSED);
  return browser;
};

describe('POST /admin/updateResult', () => {
  it('saved: 200 {success: true}; the game is scored and its predictions with it', async () => {
    const browser = await manager();
    const page = await browser.post(PATH, boxes(STARTED, '85', '80'));
    expect(page.status).toBe(200);
    expect(json(page)).toEqual({ success: true });
    expect(await scoreOf(STARTED)).toEqual({
      home_score: 85,
      postponed: false,
    });
    const points = await client.query(
      "select count(*)::int as rows from match_points where game_id = $1 and source = 'ruled'",
      [STARTED],
    );
    expect(points.rows).toEqual([{ rows: 1 }]);
  });

  it.each([
    ['85', '', 'Įveskite abu rezultatus.'],
    [
      '-3',
      '80',
      'Rezultatas negali būti neigiamas. Atidėtoms rungtynėms įveskite -1 : -1.',
    ],
    ['80', '80', 'Lygiosios negalimos - komandų rezultatai turi skirtis.'],
  ])(
    'refused: %s : %s is a 422 "%s", nothing written',
    async (home, away, text) => {
      const browser = await manager();
      const page = await browser.post(PATH, boxes(STARTED, home, away));
      expect(page.status).toBe(422);
      expect(json(page)).toMatchObject({ message: text });
      expect(await scoreOf(STARTED)).toEqual({
        home_score: null,
        postponed: false,
      });
    },
  );

  it('refused: a game not yet started', async () => {
    const browser = await manager();
    const page = await browser.post(PATH, boxes(FUTURE, '85', '80'));
    expect(page.status).toBe(422);
    expect(json(page)).toMatchObject({
      message: 'Rungtynės dar neprasidėjo - rezultato įvesti negalima.',
    });
  });

  it('postponed (R-63): -1 : -1, then cleared', async () => {
    const browser = await manager();
    expect((await browser.post(PATH, boxes(FUTURE, '-1', '-1'))).status).toBe(
      200,
    );
    expect(await scoreOf(FUTURE)).toEqual({
      home_score: null,
      postponed: true,
    });
    expect((await browser.post(PATH, boxes(FUTURE, '', ''))).status).toBe(200);
    expect(await scoreOf(FUTURE)).toEqual({
      home_score: null,
      postponed: false,
    });
  });

  it('an unknown or unreadable game is a 404', async () => {
    const browser = await manager();
    expect((await browser.post(PATH, boxes(999999, '85', '80'))).status).toBe(
      404,
    );
    expect((await browser.post(PATH, boxes(0, '85', '80'))).status).toBe(404);
  });

  it('a player is sent home, and nothing is written', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'player');
    await savePlaying(db, client, CLOSED);
    const page = await browser.post(PATH, boxes(STARTED, '85', '80'));
    expect(page.status).toBe(303);
    expect(page.location).toBe('/');
    expect(await scoreOf(STARTED)).toEqual({
      home_score: null,
      postponed: false,
    });
  });

  it('a guest is sent home, and nothing is written', async () => {
    await saveTournamentWithGames(db, CLOSED);
    const page = await new Browser(baseUrl, '192.0.2.91').post(
      PATH,
      boxes(STARTED, '85', '80'),
    );
    expect(page.status).toBe(303);
    expect(page.location).toBe('/');
    expect(await scoreOf(STARTED)).toEqual({
      home_score: null,
      postponed: false,
    });
  });

  it('another site is refused (403), and nothing is written', async () => {
    const browser = await manager();
    const page = await browser.post(PATH, boxes(STARTED, '85', '80'), {
      origin: 'https://evil.example',
    });
    expect(page.status).toBe(403);
    expect(await scoreOf(STARTED)).toEqual({
      home_score: null,
      postponed: false,
    });
  });
});
