import {
  createSession,
  insertTournaments,
  listTournaments,
} from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { DAY_SECONDS, secondsAfter, utcDay, type Role } from '@sportbet/domain';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { now } from '../../src/server/clock';
import {
  hashSessionToken,
  newSessionToken,
} from '../../src/server/session/session-token';
import { JONAS_ACCOUNT, saveAccounts } from '../support/accounts';
import { Browser, documentOf, setCookieFor } from '../support/browser';
import { EUROLEAGUE_2026_27 } from '../support/tournaments';

// R-44, and #16: what the page tells the browser about the player.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const SESSION = '__Host-sb_session';

/** A browser holding a session for Jonas that began `daysAgo` days ago and was last re-issued then. */
async function sessionFrom(
  daysAgo: number,
  role: Role = 'player',
): Promise<{ browser: Browser; token: string }> {
  await saveAccounts(db, [JONAS_ACCOUNT], role);
  const token = newSessionToken();
  const began = secondsAfter(now(), -daysAgo * DAY_SECONDS);
  await createSession(db, {
    player: JONAS_ACCOUNT.id,
    tokenHash: hashSessionToken(token),
    now: began,
  });
  const browser = new Browser(baseUrl, '192.0.2.10');
  browser.setCookie(SESSION, `${token}.${utcDay(began)}`);
  return { browser, token };
}

const endOf = async () =>
  z
    .array(z.object({ expires_at: z.date() }))
    .parse((await client.query('select expires_at from sessions')).rows)[0]
    ?.expires_at.getTime() ?? 0;

describe('R-44: a sign-in lasts 90 days from the last visit', () => {
  it('a visit on a new day extends the session to 90 days on and re-issues the cookie for 90 days', async () => {
    const { browser, token } = await sessionFrom(2);
    const before = await endOf();
    const page = await browser.get('/');
    const cookie = setCookieFor(page, SESSION) ?? '';
    expect(cookie).toMatch(
      new RegExp(`^${SESSION}=${token}\\.${utcDay(now())};`),
    );
    expect(cookie).toMatch(/Max-Age=7776000/);
    const after = await endOf();
    expect(after - before).toBeGreaterThanOrEqual(
      2 * DAY_SECONDS * 1000 - 60_000,
    );
    expect(Math.abs(after - (now() + 90 * DAY_SECONDS * 1000))).toBeLessThan(
      60_000,
    );
  });

  it('a visit on the same day writes nothing and re-issues nothing', async () => {
    const { browser } = await sessionFrom(0);
    const before = await endOf();
    const page = await browser.get('/');
    expect(setCookieFor(page, SESSION)).toBeUndefined();
    expect(await endOf()).toBe(before);
  });

  it('a session over 90 days old is over: the cookie is cleared and the visitor is a guest', async () => {
    const { browser } = await sessionFrom(91);
    const page = await browser.get('/');
    expect(setCookieFor(page, SESSION)).toMatch(/Max-Age=0/);
    expect(
      documentOf(page).querySelector('[data-testid="sign-in-dialog"]'),
    ).not.toBeNull();
  });

  it('a cookie that is not a session is cleared', async () => {
    const browser = new Browser(baseUrl, '192.0.2.11');
    browser.setCookie(SESSION, 'nonsense');
    expect(setCookieFor(await browser.get('/'), SESSION)).toMatch(/Max-Age=0/);
  });
});

describe("the player's shell (#16)", () => {
  it('reaches the browser with the display name and initials only: no surname, no address', async () => {
    const { browser } = await sessionFrom(0);
    const page = await browser.get('/');
    expect(page.html).toContain('Jonas P.');
    expect(page.html).toContain('>JP<');
    expect(page.html).not.toContain('Petraitis');
    expect(page.html).not.toContain('jonas.petraitis');
    expect(page.html).not.toContain('@example.lt');
  });

  it('shows the tournament the player plays, and links to no page that does not exist - an admin\'s included; "Keisti turnyrą" since slice 5, the "Spėjimai" tab since slice 6, administration since slice 7', async () => {
    const { browser } = await sessionFrom(0, 'superadmin');
    await insertTournaments(db, [EUROLEAGUE_2026_27]);
    const [tournament] = await listTournaments(db);
    if (tournament === undefined) throw new Error('no tournament');
    await client.query(
      `insert into tournament_players (tournament_id, player_id, switched_off, fill_ins) values ($1, 1, false, 0)`,
      [tournament.id],
    );
    const page = documentOf(await browser.get('/'));
    expect(
      page.querySelector('[data-testid="rail-context"]')?.textContent,
    ).toContain(tournament.name);
    expect(page.querySelector('a[href="/userProfile"]')).toBeNull();
    expect(page.querySelector('a[href="/admin/index"]')).not.toBeNull();
    expect(page.querySelector('a[href="/tournaments/exit"]')).not.toBeNull();
    expect(page.querySelector('form[action="/leagues/switch"]')).toBeNull();
    // Slice 6: "Spėjimai" is a player's bottom tab, so the tabs are drawn.
    expect(
      page.querySelector(
        '[data-testid="bottom-tabs"] a[href="/prediction/results"]',
      ),
    ).not.toBeNull();
    expect(page.querySelector('form[action="/logout"]')).not.toBeNull();
  });

  it('draws no administration link for a player who is no admin (slice 7)', async () => {
    const { browser } = await sessionFrom(0);
    const page = documentOf(await browser.get('/'));
    expect(page.querySelector('[data-testid="rail"]')).not.toBeNull();
    expect(page.querySelector('a[href="/admin/index"]')).toBeNull();
  });
});
