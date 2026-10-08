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
  type PlannedTournament,
} from '../support/registration';
import { EUROLEAGUE_2025_26 } from '../support/tournaments';

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
  const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
    role: 'results-manager',
  });
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
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
      role: 'player',
    });
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

// The security review's checklist (Tasks 10 and 13) and its N1.
describe('POST /admin/updateResult: what the review asked', () => {
  /** A tournament over: its end date passed, every game scored (R-21, R-22). */
  const FINISHED: PlannedTournament = {
    id: 44,
    tournament: {
      ...EUROLEAGUE_2025_26,
      slug: 'euroleague-2024-25',
      name: 'Euroleague 2024/25',
      endsOn: '2025-05-25',
    },
    firstGameInDays: -500,
    deadlineInDays: -450,
  };

  it('answers POST only: a GET is 405, and nothing is written', async () => {
    const browser = await manager();
    expect((await browser.get(PATH)).status).toBe(405);
    expect(await scoreOf(STARTED)).toEqual({
      home_score: null,
      postponed: false,
    });
  });

  it('a malformed body is not a 500 (N1): read as empty, so no game, a 404', async () => {
    const browser = await manager();
    const session = browser.cookie('__Host-sb_session') ?? '';
    const page = await fetch(new URL(PATH, baseUrl), {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: browser.origin,
        Cookie: `__Host-sb_session=${session}`,
        'Content-Type': 'multipart/form-data; boundary=sportbet',
      },
      body: 'not a multipart body',
    });
    expect(page.status).toBe(404);
  });

  it("R-67: a finished tournament's result is refused, and nothing is written", async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
      role: 'results-manager',
    });
    await saveTournamentWithGames(db, FINISHED);
    const [first, second] = gamesOf(FINISHED);
    await client.query(
      'update games set home_score = 88, away_score = 79 where id = any($1)',
      [[first, second]],
    );
    const page = await browser.post(PATH, boxes(first, '85', '80'));
    expect(page.status).toBe(422);
    expect(json(page)).toMatchObject({
      message: 'Turnyras baigtas - rezultatų keisti negalima.',
    });
    expect(await scoreOf(first)).toEqual({ home_score: 88, postponed: false });
  });

  it('a results manager enters a result in a tournament they do not play (R-26 amended)', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
      role: 'results-manager',
    });
    await saveTournamentWithGames(db, CLOSED);
    const page = await browser.post(PATH, boxes(STARTED, '85', '80'));
    expect(page.status).toBe(200);
    expect(await scoreOf(STARTED)).toEqual({
      home_score: 85,
      postponed: false,
    });
  });
});

// R-69: at most 30 accepted result saves a minute per account, counted
// after the form check, so a typo never counts.
describe('POST /admin/updateResult: the limit (R-69)', () => {
  it('a post the form refuses does not count: after 30 of them a result is still saved', async () => {
    const browser = await manager();
    for (let post = 0; post < 30; post += 1) {
      expect((await browser.post(PATH, boxes(STARTED, '85', ''))).status).toBe(
        422,
      );
    }
    expect((await browser.post(PATH, boxes(STARTED, '85', '80'))).status).toBe(
      200,
    );
  });

  it("the 31st accepted save within a minute is 429 with the throttle's text, and writes nothing", async () => {
    const browser = await manager();
    for (let save = 0; save < 30; save += 1) {
      const home = save % 2 === 0 ? '85' : '86';
      expect(
        (await browser.post(PATH, boxes(STARTED, home, '80'))).status,
      ).toBe(200);
    }
    const page = await browser.post(PATH, boxes(STARTED, '99', '80'));
    expect(page.status).toBe(429);
    expect(json(page)).toMatchObject({
      message: 'Per daug bandymų. Pabandykite dar kartą po 1 min.',
    });
    expect(await scoreOf(STARTED)).toEqual({
      home_score: 86,
      postponed: false,
    });
  });
});
