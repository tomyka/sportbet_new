import { issueLoginCode } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { isoSecond, now } from '../../src/server/clock';
import { seal } from '../../src/server/sealed';
import { hashLoginCode } from '../../src/server/sign-in/code-hash';
import {
  JONAS_ACCOUNT,
  JONAS_EMAIL,
  ZUKAUSKAS_ACCOUNT,
} from '../support/accounts';
import { formOf, followed, said } from '../support/admin';
import { TEST_AUTH_SECRET } from '../support/app';
import { Browser, setCookieFor } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import {
  clearMail,
  codesTo,
  settleMail,
  waitForCodes,
} from '../support/mailpit';
import { gamesOf, savePlaying } from '../support/predictions';
import { SOONER } from '../support/registration';
import { serverLogSince } from '../support/server-log';

// Slice 13 (#30), task 14: the emailed confirmation of a destructive
// superadmin action (R-26 amended) - deleting a game (R-89) - through the
// built app: the ask, the cookie, the mail, the shared code check, and
// everything that must not confirm.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const serverLogPath = inject('serverLogPath');
const { db, client } = useTestDatabase();

const CONFIRM = '__Host-sb_confirm';
const [GAME, PLAYED_GAME] = gamesOf(SOONER);

beforeEach(async () => {
  await clearMail(mailpitUrl);
});

/** Jonas, a superadmin playing SOONER, whose game 411 is blank. */
async function boss(ip = '192.0.2.70') {
  const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
    role: 'superadmin',
    ip,
  });
  await savePlaying(db, client, SOONER);
  return browser;
}

const ask = (browser: Browser, game = GAME) =>
  browser.post('/admin/deleteGame', formOf({ gameID: String(game) }));

const confirm = (browser: Browser, code: string) =>
  browser.post('/admin/confirm/save', formOf({ code }));

/** The nth code mailed to Jonas, waited for (a code goes out after the response). */
async function codeNumber(nth: number): Promise<string> {
  const codes = await waitForCodes(mailpitUrl, JONAS_EMAIL, nth);
  const code = codes[nth - 1];
  if (code === undefined) throw new Error('no code');
  return code;
}

const gamesCount = async (id: number): Promise<number> =>
  z
    .array(z.object({ n: z.int() }))
    .parse(
      (
        await client.query(
          'select count(*)::int as n from games where id = $1',
          [id],
        )
      ).rows,
    )[0]?.n ?? -1;

const rowsOfGame = async (id: number): Promise<number> =>
  z
    .array(z.object({ n: z.int() }))
    .parse(
      (
        await client.query(
          'select count(*)::int as n from match_predictions where game_id = $1',
          [id],
        )
      ).rows,
    )[0]?.n ?? -1;

describe('asking (POST /admin/deleteGame)', () => {
  it('asks for a code: a 303 to /admin/confirm, the action sealed in a cookie of its own flags, the code mailed to the admin and not in the cookie', async () => {
    const browser = await boss();
    const posted = await ask(browser);
    expect([posted.status, posted.location]).toEqual([303, '/admin/confirm']);
    const cookie = setCookieFor(posted, CONFIRM);
    expect(cookie).toMatch(/Max-Age=300/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//i);
    const code = await codeNumber(1);
    expect(cookie).not.toContain(code);
    expect(await gamesCount(GAME)).toBe(1);
  });

  it('the mail names the action in words and says the code signs nobody in', async () => {
    const browser = await boss();
    await ask(browser);
    await codeNumber(1);
    const found = z
      .object({ messages: z.array(z.object({ ID: z.string() })) })
      .parse(
        await (
          await fetch(
            `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${JONAS_EMAIL}"`)}`,
          )
        ).json(),
      );
    const message = z
      .object({ Text: z.string(), Subject: z.string() })
      .parse(
        await (
          await fetch(
            `${mailpitUrl}/api/v1/message/${found.messages[0]?.ID ?? ''}`,
          )
        ).json(),
      );
    expect(message.Subject).toBe('Veiksmo patvirtinimo kodas');
    expect(message.Text).toContain(
      `veiksmą: Ištrinti žaidimą #${String(GAME)}. Kodas galioja 5 min.`,
    );
    expect(message.Text).not.toContain('Home 41');
    expect(message.Text).toContain('Šiuo kodu prisijungti negalima.');
  });

  it('the confirmation page shows what will happen and one code box', async () => {
    const browser = await boss();
    await ask(browser);
    const page = await browser.get('/admin/confirm');
    expect(page.status).toBe(200);
    expect(said(page)).toContain(
      `Ištrinti žaidimą #${String(GAME)}: Home 41 - Away 41`,
    );
    expect(page.html).toContain('name="code"');
  });

  it('a refused delete sends no mail and sets no cookie: a real prediction (R-89), a result', async () => {
    const browser = await boss();
    await client.query(
      'update match_predictions set home = 80, away = 70 where player_id = 1 and game_id = $1',
      [GAME],
    );
    await client.query(
      "update games set tip_off = date_trunc('second', now() - interval '10 days'), home_score = 85, away_score = 80 where id = $1",
      [PLAYED_GAME],
    );
    const real = await ask(browser, GAME);
    expect([real.status, real.location]).toEqual([303, '/admin/games']);
    expect(said(await followed(browser, real))).toContain(
      'Šių rungtynių ištrinti negalima: jos jau turi spėjimų.',
    );
    const scored = await ask(browser, PLAYED_GAME);
    expect(said(await followed(browser, scored))).toContain(
      'Šių rungtynių ištrinti negalima: jos jau turi rezultatą.',
    );
    expect(browser.cookie(CONFIRM)).toBeUndefined();
    await settleMail(mailpitUrl);
    expect(await codesTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
  });

  it('a survival pick on a team of the game in its round refuses the delete (R-125) with no mail and no cookie; a pick in another round does not', async () => {
    const browser = await boss();
    const row = z
      .array(
        z.object({
          round: z.int(),
          home: z.int(),
          other: z.int(),
        }),
      )
      .parse(
        (
          await client.query(
            'select g.round_id as round, g.home_team_id as home, (select min(r.id) from rounds r where r.tournament_id = g.tournament_id and r.id <> g.round_id) as other from games g where g.id = $1',
            [GAME],
          )
        ).rows,
      )[0];
    if (row === undefined) throw new Error('no game');
    await client.query(
      'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (1, 41, $1, $2)',
      [row.other, row.home],
    );
    const elsewhere = await ask(browser);
    expect(elsewhere.location).toBe('/admin/confirm');
    await client.query('delete from survival_picks');
    await client.query(
      'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (1, 41, $1, $2)',
      [row.round, row.home],
    );
    await codeNumber(1);
    await clearMail(mailpitUrl);
    const refused = await ask(browser);
    expect([refused.status, refused.location]).toEqual([303, '/admin/games']);
    expect(said(await followed(browser, refused))).toContain(
      'Rungtynių, kurių komandas jau pasirinko išlikimo žaidėjai, ištrinti negalima.',
    );
    expect(await gamesCount(GAME)).toBe(1);
    await settleMail(mailpitUrl);
    expect(await codesTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
  });

  it('a game that is none, or of another tournament, is a 404; nothing is mailed', async () => {
    const browser = await boss();
    expect((await ask(browser, 99_999)).status).toBe(404);
    expect(
      (await browser.post('/admin/deleteGame', formOf({ gameID: 'x' }))).status,
    ).toBe(404);
    await settleMail(mailpitUrl);
    expect(await codesTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
  });

  it('a guest, a player and a results manager are sent home and nothing is mailed', async () => {
    expect((await ask(new Browser(baseUrl, '192.0.2.71'))).location).toBe('/');
    for (const role of ['player', 'results-manager'] as const) {
      const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
        role,
      });
      await savePlaying(db, client, SOONER);
      expect((await ask(browser)).location).toBe('/');
    }
    await settleMail(mailpitUrl);
    expect(await codesTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
  });

  it('five codes in ten minutes: the sixth ask is throttled, with no mail', async () => {
    const browser = await boss();
    for (let asked = 0; asked < 5; asked += 1) {
      expect((await ask(browser)).location).toBe('/admin/confirm');
    }
    const sixth = await ask(browser);
    expect(sixth.location).toBe('/admin/games');
    expect(said(await followed(browser, sixth))).toContain(
      'Per daug bandymų. Pabandykite dar kartą po',
    );
    await waitForCodes(mailpitUrl, JONAS_EMAIL, 5);
    await settleMail(mailpitUrl);
    expect(await codesTo(mailpitUrl, JONAS_EMAIL)).toHaveLength(5);
  });
});

describe('confirming (POST /admin/confirm/save)', () => {
  it('a wrong code says so and keeps the action pending; the right one deletes the game and its blank rows, clears the cookie with its flags, and says so', async () => {
    const browser = await boss();
    await ask(browser);
    const code = await codeNumber(1);
    const wrong = await confirm(
      browser,
      code === '00000000' ? '11111111' : '00000000',
    );
    expect([wrong.status, wrong.location]).toEqual([303, '/admin/confirm']);
    expect(said(await followed(browser, wrong))).toContain(
      'Neteisingas arba pasibaigęs kodas.',
    );
    expect(browser.cookie(CONFIRM)).toBeDefined();
    expect(await gamesCount(GAME)).toBe(1);
    const done = await confirm(browser, code);
    expect([done.status, done.location]).toEqual([303, '/admin/games']);
    expect(said(await followed(browser, done))).toContain(
      `Žaidimas #${String(GAME)} ištrintas.`,
    );
    const cleared = setCookieFor(done, CONFIRM);
    expect(cleared).toMatch(/Max-Age=0/i);
    expect(cleared).toMatch(/Secure/i);
    expect(browser.cookie(CONFIRM)).toBeUndefined();
    expect(await gamesCount(GAME)).toBe(0);
    expect(await rowsOfGame(GAME)).toBe(0);
  });

  it('a code is used once: the same code again finds nothing to confirm', async () => {
    const browser = await boss();
    await ask(browser);
    const code = await codeNumber(1);
    await confirm(browser, code);
    const again = await confirm(browser, code);
    expect(again.location).toBe('/admin/index');
    expect(said(await followed(browser, again))).toContain(
      'Nėra veiksmo, kurį reikėtų patvirtinti.',
    );
  });

  it('with no cookie there is nothing to confirm, whatever the code', async () => {
    const browser = await boss();
    const page = await confirm(browser, '12345678');
    expect([page.status, page.location]).toEqual([303, '/admin/index']);
    expect(said(await followed(browser, page))).toContain(
      'Nėra veiksmo, kurį reikėtų patvirtinti. Pradėkite iš naujo.',
    );
  });

  it("another account's cookie confirms nothing, and is cleared", async () => {
    const first = await boss();
    await ask(first);
    const code = await codeNumber(1);
    const second = await signedInBrowser(db, baseUrl, ZUKAUSKAS_ACCOUNT, {
      role: 'superadmin',
      ip: '192.0.2.72',
    });
    const value = first.cookie(CONFIRM);
    if (value === undefined) throw new Error('no cookie');
    second.setCookie(CONFIRM, value);
    const page = await confirm(second, code);
    expect(page.location).toBe('/admin/index');
    expect(second.cookie(CONFIRM)).toBeUndefined();
    expect(await gamesCount(GAME)).toBe(1);
  });

  it('a forged cookie, or one sealed for another purpose, is nothing pending', async () => {
    const browser = await boss();
    await ask(browser);
    const code = await codeNumber(1);
    const [body = ''] = (browser.cookie(CONFIRM) ?? '').split('.');
    browser.setCookie(CONFIRM, `${body}.${'A'.repeat(43)}`);
    expect((await confirm(browser, code)).location).toBe('/admin/index');
    const payload = {
      account: '1',
      action: { kind: 'delete-game', game: GAME },
      issuedAt: isoSecond(now()),
    };
    browser.setCookie(CONFIRM, seal('flash', payload, TEST_AUTH_SECRET));
    expect((await confirm(browser, code)).location).toBe('/admin/index');
    browser.setCookie(
      CONFIRM,
      seal('admin-confirm', payload, TEST_AUTH_SECRET),
    );
    expect(await gamesCount(GAME)).toBe(1);
    expect(
      said(await followed(browser, await confirm(browser, code))),
    ).toContain(`Žaidimas #${String(GAME)} ištrintas.`);
  });

  it('a code past its life is refused', async () => {
    const browser = await boss();
    await ask(browser);
    const code = await codeNumber(1);
    await client.query(
      "update login_codes set expires_at = now() - interval '1 minute'",
    );
    const page = await confirm(browser, code);
    expect(said(await followed(browser, page))).toContain(
      'Neteisingas arba pasibaigęs kodas.',
    );
    expect(await gamesCount(GAME)).toBe(1);
  });

  it('a sign-in code never confirms an action (#43), whatever its digits', async () => {
    const browser = await boss();
    await ask(browser);
    await codeNumber(1);
    await issueLoginCode(db, {
      email: unwrap(emailAddress(JONAS_EMAIL)),
      purpose: 'login',
      codeHash: await hashLoginCode('87654321'),
      now: now(),
    });
    const page = await confirm(browser, '87654321');
    expect(said(await followed(browser, page))).toContain(
      'Neteisingas arba pasibaigęs kodas.',
    );
    expect(await gamesCount(GAME)).toBe(1);
  });

  it('a second ask voids the first code, so a code only ever confirms the action the cookie names', async () => {
    const browser = await boss();
    await ask(browser);
    const first = await codeNumber(1);
    await ask(browser);
    const second = await codeNumber(2);
    expect(first).not.toBe(second);
    expect(
      said(await followed(browser, await confirm(browser, first))),
    ).toContain('Neteisingas arba pasibaigęs kodas.');
    expect(await gamesCount(GAME)).toBe(1);
    expect(
      said(await followed(browser, await confirm(browser, second))),
    ).toContain(`Žaidimas #${String(GAME)} ištrintas.`);
  });

  it("a code mailed for one game never confirms another: with the first game's cookie the second code is refused and stays good for its own", async () => {
    const browser = await boss();
    await ask(browser, GAME);
    const firstCookie = browser.cookie(CONFIRM);
    if (firstCookie === undefined) throw new Error('no cookie');
    await ask(browser, PLAYED_GAME);
    const second = await codeNumber(2);
    const secondCookie = browser.cookie(CONFIRM);
    if (secondCookie === undefined) throw new Error('no cookie');
    browser.setCookie(CONFIRM, firstCookie);
    expect(
      said(await followed(browser, await confirm(browser, second))),
    ).toContain('Neteisingas arba pasibaigęs kodas.');
    expect(await gamesCount(GAME)).toBe(1);
    expect(await gamesCount(PLAYED_GAME)).toBe(1);
    browser.setCookie(CONFIRM, secondCookie);
    expect(
      said(await followed(browser, await confirm(browser, second))),
    ).toContain(`Žaidimas #${String(PLAYED_GAME)} ištrintas.`);
    expect(await gamesCount(GAME)).toBe(1);
  });

  it('a game that went meanwhile is said to be none, and the code is spent', async () => {
    const browser = await boss();
    await ask(browser);
    const code = await codeNumber(1);
    await client.query('delete from match_predictions where game_id = $1', [
      GAME,
    ]);
    await client.query('delete from games where id = $1', [GAME]);
    const page = await confirm(browser, code);
    expect(said(await followed(browser, page))).toContain(
      'Tokių rungtynių nėra.',
    );
  });

  it('a real prediction saved meanwhile stops the delete, which decides again under its own locks', async () => {
    const browser = await boss();
    await ask(browser);
    const code = await codeNumber(1);
    await client.query(
      'update match_predictions set home = 80, away = 70 where player_id = 1 and game_id = $1',
      [GAME],
    );
    const page = await confirm(browser, code);
    expect(said(await followed(browser, page))).toContain(
      'Šių rungtynių ištrinti negalima: jos jau turi spėjimų.',
    );
    expect(await gamesCount(GAME)).toBe(1);
  });

  it('ten checks in ten minutes: the eleventh is throttled, even with the right code', async () => {
    const browser = await boss();
    await ask(browser);
    const code = await codeNumber(1);
    for (let tried = 0; tried < 10; tried += 1) {
      await confirm(browser, '00000000'.replace('0', String((tried % 8) + 1)));
    }
    const eleventh = await confirm(browser, code);
    expect(said(await followed(browser, eleventh))).toContain(
      'Per daug bandymų. Pabandykite dar kartą po',
    );
    expect(await gamesCount(GAME)).toBe(1);
  });

  it('a guest and a player are sent home; a results manager, who is an admin, finds nothing to confirm - and with the cookie of an action only a superadmin may confirm, is sent home', async () => {
    expect(
      (await confirm(new Browser(baseUrl, '192.0.2.73'), '12345678')).location,
    ).toBe('/');
    const player = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
      role: 'player',
    });
    await savePlaying(db, client, SOONER);
    expect((await confirm(player, '12345678')).location).toBe('/');
    const manager = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, {
      role: 'results-manager',
    });
    expect((await confirm(manager, '12345678')).location).toBe('/admin/index');
    manager.setCookie(
      CONFIRM,
      seal(
        'admin-confirm',
        {
          account: '1',
          action: { kind: 'delete-game', game: GAME },
          issuedAt: isoSecond(now()),
        },
        TEST_AUTH_SECRET,
      ),
    );
    expect((await confirm(manager, '12345678')).location).toBe('/');
    expect(await gamesCount(GAME)).toBe(1);
  });
});

describe('/admin/confirm (the page)', () => {
  it('with nothing pending an admin goes to the dashboard; a role the action refuses, and a guest, go home', async () => {
    const browser = await boss();
    const page = await browser.get('/admin/confirm');
    expect([page.status, page.location]).toEqual([307, '/admin/index']);
    expect(
      (await new Browser(baseUrl, '192.0.2.74').get('/admin/confirm')).location,
    ).toBe('/');
  });

  it("another account's pending action is not shown", async () => {
    const first = await boss();
    await ask(first);
    const second = await signedInBrowser(db, baseUrl, ZUKAUSKAS_ACCOUNT, {
      role: 'superadmin',
      ip: '192.0.2.75',
    });
    const value = first.cookie(CONFIRM);
    if (value === undefined) throw new Error('no cookie');
    second.setCookie(CONFIRM, value);
    const page = await second.get('/admin/confirm');
    expect([page.status, page.location]).toEqual([307, '/admin/index']);
  });
});

describe('nothing personal is logged', () => {
  it('neither the address nor the code reaches the server log through the whole delete', async () => {
    const logSince = serverLogSince(serverLogPath);
    const browser = await boss();
    await ask(browser);
    const code = await codeNumber(1);
    await confirm(browser, '00000000');
    await confirm(browser, code);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const log = await logSince('');
    expect(log).not.toContain(JONAS_EMAIL);
    expect(log).not.toContain(code);
  });
});
