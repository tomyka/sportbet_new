import { insertTournamentPlayer, useTestDatabase } from '@sportbet/db/testing';
import { emailAddress, type StoredPlayer } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { describe, expect, inject, it } from 'vitest';
import {
  JONAS_ACCOUNT,
  saveAccounts,
  ZUKAUSKAS_ACCOUNT,
} from '../support/accounts';
import { Browser, documentOf } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { gamesOf, jonasPlaying, savePlaying } from '../support/predictions';
import { CLOSED, SOONER } from '../support/registration';

// Slice 11 (#28): the summaries, the chart and compare at sportbet's URLs,
// against the built app. SOONER (41) has one game a week off and one in
// 40 days; CLOSED (43) has both games already tipped off (30 days ago and
// yesterday), so a result can be posted on them.

/** A third account, in no tournament. */
const TRECIAS_ACCOUNT: StoredPlayer = {
  id: player('3'),
  username: 'trecias',
  email: unwrap(emailAddress('trecias@example.lt')),
  name: 'Trečias',
  surname: 'Trečiauskas',
};

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const RESULTS = '/summary/prediction/results';

const [CLOSED_FIRST, CLOSED_SECOND] = gamesOf(CLOSED);
const [SOONER_FIRST] = gamesOf(SOONER);

/** Zukauskas (player 2) a listed player of `tournament`, with `scores` on its first game. */
async function zukauskasPlays(
  tournament: number,
  game: number,
  scores: readonly [number, number] | null,
): Promise<void> {
  await saveAccounts(db, [ZUKAUSKAS_ACCOUNT]);
  await insertTournamentPlayer(client, { tournament, player: 2 });
  await client.query(
    "insert into match_predictions (player_id, game_id, home, away, origin) values (2, $1, $2, $3, 'real')",
    [game, scores?.[0] ?? null, scores?.[1] ?? null],
  );
}

/** Jonas, a results manager, playing CLOSED with Zukauskas, the first game scored 85-80. */
async function scoredTogether(): Promise<Browser> {
  const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
    role: 'results-manager',
  });
  await savePlaying(db, client, CLOSED);
  await zukauskasPlays(CLOSED.id, CLOSED_FIRST, [90, 80]);
  // Both games in round 1 (the second the return game): it holds a scored and a started unscored game, so it shows unfolded.
  await client.query(
    'update games set round_id = $1, home_team_id = $3, away_team_id = $4 where id = $2',
    [CLOSED_FIRST, CLOSED_SECOND, CLOSED.id * 10 + 2, CLOSED.id * 10 + 1],
  );
  const body = new FormData();
  body.set('gameID', String(CLOSED_FIRST));
  body.set('homeTeamScore', '85');
  body.set('awayTeamScore', '80');
  expect((await browser.post('/admin/updateResult', body)).status).toBe(200);
  return browser;
}

describe(`GET ${RESULTS} (getPredictionResultSummary)`, () => {
  it('a guest is sent to sign in, to come back here', async () => {
    const page = await new Browser(baseUrl, '192.0.2.101').get(RESULTS);
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=${encodeURIComponent(RESULTS)}`,
    );
  });

  it.each(['/compare/0', '/compare/007', '/compare/2147483648'])(
    'a guest at %s, digits the route accepts, is sent to sign in (no page to return to)',
    async (path) => {
      const page = await new Browser(baseUrl, '192.0.2.104').get(path);
      expect(page.status).toBe(307);
      expect(page.location).toBe('/login');
    },
  );

  it.each(['/compare/abc', '/compare/%2B1'])(
    'a guest at %s, which the route does not match, gets a 404',
    async (path) => {
      const page = await new Browser(baseUrl, '192.0.2.104').get(path);
      expect(page.status).toBe(404);
    },
  );

  it('a player in no tournament goes to the front page', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const page = await browser.get(RESULTS);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it("another player's prediction on an open game is never sent; once the game starts it shows (R-86's started games)", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    await zukauskasPlays(SOONER.id, SOONER_FIRST, [101, 97]);
    const open = await browser.get(RESULTS);
    expect(open.status).toBe(200);
    expect(open.html).not.toContain('101:97');
    expect(open.html).not.toContain('Home 41');
    await client.query(
      "update games set tip_off = date_trunc('second', now()) - interval '1 minute' where id = $1",
      [SOONER_FIRST],
    );
    const started = documentOf(await browser.get(RESULTS));
    const badges = Array.from(
      started.querySelectorAll('[data-testid="sr-badge"]'),
      (badge) => [badge.textContent, badge.getAttribute('data-verdict')],
    );
    expect(badges).toEqual([['101:97', 'pending']]);
    expect(
      started.querySelector('[data-testid="sr-result"]')?.textContent,
    ).toBe('-');
  });

  it('a scored game: the result, everyone\'s points and a verdict badge; the viewer\'s column is marked; "Suvestinė" > "Prognozės" is in the navigation', async () => {
    const browser = await scoredTogether();
    const document = documentOf(await browser.get(RESULTS));
    const columns = Array.from(document.querySelectorAll('thead th'), (head) =>
      head.getAttribute('title'),
    );
    expect(columns[0]).toBeNull();
    expect(columns.slice(1).sort()).toEqual(['jonas', 'zuk']);
    expect(
      document.querySelector('th[data-me="true"]')?.getAttribute('title'),
    ).toBe('jonas');
    const rows = Array.from(document.querySelectorAll('tbody tr')).filter(
      (row) => row.querySelector('[data-testid="sr-result"]') !== null,
    );
    const scoredRow = rows.find(
      (row) =>
        row.querySelector('[data-testid="sr-result"]')?.textContent === '85:80',
    );
    expect(scoredRow?.textContent).toContain('Home 43 · Away 43');
    // Jonas's blank row was filled in by dice; Zukauskas's 90:80 has the winner.
    const zukauskasBadge = Array.from(
      scoredRow?.querySelectorAll('[data-testid="sr-badge"]') ?? [],
    ).find((badge) => badge.textContent === '90:80');
    expect(zukauskasBadge?.getAttribute('data-verdict')).toBe('ok');
    expect(
      scoredRow?.querySelectorAll('[data-testid="sr-points"]'),
    ).toHaveLength(2);
    expect(
      document.querySelector('a[href="/summary/prediction/results"]')
        ?.textContent,
    ).toContain('Prognozės');
  });
});

const STANDINGS = '/summary/prediction/standings';

describe(`GET ${STANDINGS} (getPredictionStandingSummary)`, () => {
  it('a guest is sent to sign in, to come back here', async () => {
    const page = await new Browser(baseUrl, '192.0.2.102').get(STANDINGS);
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=${encodeURIComponent(STANDINGS)}`,
    );
  });

  it('a player in no tournament goes to the front page', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const page = await browser.get(STANDINGS);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it("shows everyone's standings while they are still open (CONTEXT.md, standings deadline): the legend, a team row, the four badges", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    await client.query(
      'insert into standings_predictions (player_id, team_id, place, play_offs, final_four, final_place) values (1, 411, 3, true, false, 2)',
    );
    const document = documentOf(await browser.get(STANDINGS));
    expect(document.querySelector('[data-testid="sst-legend"]')).not.toBeNull();
    const headers = Array.from(
      document.querySelectorAll('thead th'),
      (head) => head.textContent,
    );
    expect(headers).toEqual(['Komanda', 'jonas']);
    const row = Array.from(
      document.querySelectorAll('[data-testid="sst-team-row"]'),
    ).find((each) => each.textContent.includes('Home 41'));
    const badges = Array.from(
      row?.querySelectorAll('[data-testid="sst-badge"]') ?? [],
      (badge) => [badge.textContent, badge.getAttribute('data-verdict')],
    );
    expect(badges).toEqual([
      ['3', 'pending'],
      ['✓', 'pending'],
      ['-', 'none'],
      ['2', 'pending'],
    ]);
  });
});

const CHART = '/summary/chart';

describe(`GET ${CHART} (getChartData)`, () => {
  it('a guest is sent to sign in, to come back here', async () => {
    const page = await new Browser(baseUrl, '192.0.2.103').get(CHART);
    expect(page.status).toBe(307);
    expect(page.location).toBe(`/login?intended=${encodeURIComponent(CHART)}`);
  });

  it('a player in no tournament goes to the front page', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const page = await browser.get(CHART);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it('"Taškų dinamika", the count of scored games, one line per listed player and a legend button each', async () => {
    const browser = await scoredTogether();
    const document = documentOf(await browser.get(CHART));
    expect(document.body.textContent).toContain('Taškų dinamika');
    expect(document.body.textContent).toContain('1 rungtynės');
    const lines = Array.from(
      document.querySelectorAll('[data-testid="chart-line"]'),
      (line) => line.getAttribute('stroke'),
    );
    expect(lines.sort()).toEqual([
      'var(--color-series-1)',
      'var(--color-series-2)',
    ]);
    const legend = Array.from(
      document.querySelectorAll('button[aria-pressed]'),
      (button) => button.textContent,
    );
    expect(legend.sort()).toEqual(['jonas', 'zuk']);
  });

  it("draws a line in the player's own colour from sportbet (R-136) and the other in its series token", async () => {
    const browser = await scoredTogether();
    await client.query(
      "update players set chart_colour = '#d96c6c' where id = 1",
    );
    const document = documentOf(await browser.get(CHART));
    const strokes = Array.from(
      document.querySelectorAll('[data-testid="chart-line"]'),
      (line) => [line.getAttribute('data-player'), line.getAttribute('stroke')],
    );
    expect(strokes).toHaveLength(2);
    expect(strokes.find(([who]) => who === '1')?.[1]).toBe('#d96c6c');
    expect(strokes.find(([who]) => who === '2')?.[1]).toMatch(
      /^var\(--color-series-\d+\)$/,
    );
    const dots = Array.from(
      document.querySelectorAll('[data-testid="chart-dot"]'),
      (dot) => dot.getAttribute('style'),
    );
    expect(dots.filter((style) => style?.includes('#d96c6c'))).toHaveLength(1);
  });

  it('before any game is scored (while the chart is still empty): "0 rungtynių" and no line', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const document = documentOf(await browser.get(CHART));
    expect(document.body.textContent).toContain('0 rungtynių');
    expect(
      document.querySelectorAll('[data-testid="chart-line"]'),
    ).toHaveLength(0);
  });
});

const COMPARE = '/compare/2';

describe('GET /compare/{userID} (CompareController::show)', () => {
  it('a guest is sent to sign in, to come back here', async () => {
    const page = await new Browser(baseUrl, '192.0.2.104').get(COMPARE);
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=${encodeURIComponent(COMPARE)}`,
    );
  });

  it('a player in no tournament goes to the front page', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const page = await browser.get(COMPARE);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it.each([
    '/compare/0',
    '/compare/007',
    '/compare/abc',
    '/compare/%2B1',
    '/compare/2147483648',
  ])('%s is no player: 404 for a signed-in player', async (path) => {
    const browser = await scoredTogether();
    expect((await browser.get(path)).status).toBe(404);
  });

  it('oneself goes to the game page', async () => {
    const browser = await scoredTogether();
    const page = await browser.get('/compare/1');
    expect(page.status).toBe(307);
    expect(page.location).toBe('/main');
  });

  it("a player outside the tournament's listed players is a 404 (R-73)", async () => {
    const browser = await scoredTogether();
    await saveAccounts(db, [TRECIAS_ACCOUNT]);
    expect((await browser.get('/compare/3')).status).toBe(404);
    expect((await browser.get('/compare/99')).status).toBe(404);
  });

  it('two players: both sides, "Bendri statistikos", and "Etapai" with the round, "Atgal" to the game page', async () => {
    const browser = await scoredTogether();
    const page = await browser.get(COMPARE);
    expect(page.status).toBe(200);
    const document = documentOf(page);
    const text = document.body.textContent;
    expect(text).toContain('jonas');
    expect(text).toContain('zuk');
    expect(text).toContain('Bendri statistikos');
    expect(text).toContain('Rungtynių taškai');
    expect(
      document.querySelector('[data-testid="compare-record"]'),
    ).not.toBeNull();
    expect(
      Array.from(
        document.querySelectorAll('[data-testid="compare-round"]'),
        (row) => row.children[1]?.textContent,
      ),
    ).toEqual(['1 turas']);
    expect(
      document.querySelector('a[href="/main"] [data-icon="arrow-left"]'),
    ).not.toBeNull();
  });

  it("the game page's league table links every other player's name to compare, not the viewer's own", async () => {
    const browser = await scoredTogether();
    const document = documentOf(await browser.get('/main'));
    const names = Array.from(
      document.querySelectorAll('[data-testid="lb-row"] a[href^="/compare/"]'),
      (link) => [link.textContent, link.getAttribute('href')],
    );
    expect(names).toEqual([['zuk', '/compare/2']]);
  });
});
