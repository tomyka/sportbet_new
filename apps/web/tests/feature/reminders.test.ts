import { useTestDatabase } from '@sportbet/db/testing';
import { player } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { unsubscribeSignature } from '../../src/server/reminders/unsubscribe-link';
import {
  JONAS_ACCOUNT,
  JONAS_EMAIL,
  saveAccounts,
  ZUKAUSKAS_ACCOUNT,
} from '../support/accounts';
import { TEST_AUTH_SECRET, TEST_CRON_SECRET } from '../support/app';
import { Browser, documentOf, setCookieFor } from '../support/browser';
import { clearMail, mailsTo, settleMail } from '../support/mailpit';
import { savePlaying } from '../support/predictions';
import { SOONER } from '../support/registration';
import { serverLogSince } from '../support/server-log';

// Slice 16 (R-97, R-98), against the built app: the cron route sends the due
// reminders to the Mailpit stand-in, and the unsubscribe page and handler
// turn the setting off. Nothing here reaches a real mail service: the app's
// transport is the stand-in on a loopback port.

const baseUrl = inject('baseUrl');
const mailpitUrl = inject('mailpitUrl');
const serverLogPath = inject('serverLogPath');
const { db, client } = useTestDatabase();

const CRON = '/api/cron/reminders';

/** Today's tournament, its round-1 game 30 minutes from now (always past its reminder time) and its round-5 game 40 days off (beyond the 48 hours). */
const SOON = {
  ...SOONER,
  id: 44,
  firstGameInDays: 30 / 1440,
};
const FIRST_GAME = 441;
const LATER_GAME = 445;

const cron = (authorization?: string, method = 'POST') =>
  fetch(new URL(CRON, baseUrl), {
    method,
    headers:
      authorization === undefined ? {} : { Authorization: authorization },
  });

const good = `Bearer ${TEST_CRON_SECRET}`;

const remindedAt = async (game: number) =>
  z
    .array(z.object({ reminded_at: z.date().nullable() }))
    .parse(
      (
        await client.query(
          'select reminded_at from match_predictions where player_id = 1 and game_id = $1',
          [game],
        )
      ).rows,
    )[0]?.reminded_at;

const receives = async (id = 1) =>
  z
    .array(z.object({ receive_reminders: z.boolean() }))
    .parse(
      (
        await client.query(
          'select receive_reminders from player_settings where player_id = $1',
          [id],
        )
      ).rows,
    )[0]?.receive_reminders;

const optIn = (id = 1) =>
  client.query(
    'update player_settings set receive_reminders = true where player_id = $1',
    [id],
  );

const leases = async () =>
  z
    .array(z.object({ n: z.int() }))
    .parse(
      (await client.query('select count(*)::int as n from job_leases')).rows,
    )[0]?.n;

/** Jonas plays the tournament with a game in 30 minutes, and wants reminders. */
async function jonasWantsReminders(): Promise<void> {
  await saveAccounts(db, [JONAS_ACCOUNT, ZUKAUSKAS_ACCOUNT]);
  await savePlaying(db, client, SOON);
  await optIn();
}

beforeEach(async () => {
  await clearMail(mailpitUrl);
});

describe(`POST ${CRON}`, () => {
  it('answers 401 with no body for no header or a wrong secret, and sends nothing', async () => {
    await jonasWantsReminders();
    for (const header of [
      undefined,
      'Bearer ',
      'Bearer wrong-secret',
      TEST_CRON_SECRET,
      `bearer ${TEST_CRON_SECRET}`,
    ]) {
      const answer = await cron(header);
      expect(answer.status).toBe(401);
      expect(await answer.text()).toBe('');
    }
    await settleMail(mailpitUrl);
    expect(await mailsTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
    expect(await remindedAt(FIRST_GAME)).toBeNull();
  });

  it('answers 405 to any other method, even with the secret', async () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      expect((await cron(good, method)).status).toBe(405);
    }
  });

  it('sends one reminder to the opted-in player for the game 30 minutes off, with both headers, and marks only that row', async () => {
    await jonasWantsReminders();
    const answer = await cron(good);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      sent: 1,
      refused: 0,
      failed: 0,
      unmarked: 0,
      stale: 0,
      deferred: 0,
    });
    const [mail, ...rest] = await mailsTo(mailpitUrl, JONAS_EMAIL);
    expect(rest).toEqual([]);
    expect(mail?.subject).toMatch(
      /^Prognozė: Home 44 vs Away 44 - \d{2}:\d{2} LT$/,
    );
    expect(mail?.html).toContain('Nepamirškite prognozuoti!');
    expect(mail?.html).toContain(
      `href="http://localhost:3000/prediction/game/${String(FIRST_GAME)}"`,
    );
    expect(mail?.headers['List-Unsubscribe']).toEqual([
      expect.stringMatching(
        /^<http:\/\/localhost:3000\/profile\/notifications\/unsubscribe\/1\/confirm\?signature=[\w.-]+>$/,
      ),
    ]);
    expect(mail?.headers['List-Unsubscribe-Post']).toEqual([
      'List-Unsubscribe=One-Click',
    ]);
    expect(await remindedAt(FIRST_GAME)).toBeInstanceOf(Date);
    expect(await remindedAt(LATER_GAME)).toBeNull();
    // Zukauskas never opted in: nothing for them.
    expect(await mailsTo(mailpitUrl, ZUKAUSKAS_ACCOUNT.email)).toEqual([]);
  });

  it('sends nothing the second time, and holds no lease between runs', async () => {
    await jonasWantsReminders();
    expect((await cron(good)).status).toBe(200);
    const again = await cron(good);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({
      sent: 0,
      refused: 0,
      failed: 0,
      unmarked: 0,
      stale: 0,
      deferred: 0,
    });
    expect(await mailsTo(mailpitUrl, JONAS_EMAIL)).toHaveLength(1);
    expect(await leases()).toBe(0);
  });

  it('sends nothing for a player who answered the game, or opted out', async () => {
    await jonasWantsReminders();
    await client.query(
      'update match_predictions set home = 80, away = 70 where player_id = 1 and game_id = $1',
      [FIRST_GAME],
    );
    expect(await (await cron(good)).json()).toMatchObject({ sent: 0 });
    await client.query(
      'update match_predictions set home = null, away = null where player_id = 1',
    );
    await client.query(
      'update player_settings set receive_reminders = false where player_id = 1',
    );
    expect(await (await cron(good)).json()).toMatchObject({ sent: 0 });
    expect(await mailsTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
  });

  it("answers { skipped: 'running' } and sends nothing while another run holds the lease", async () => {
    await jonasWantsReminders();
    await client.query(
      "insert into job_leases (job, held_until, run_id) values ('reminders', now() + interval '10 minutes', gen_random_uuid())",
    );
    const answer = await cron(good);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ skipped: 'running' });
    expect(await mailsTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
    expect(await remindedAt(FIRST_GAME)).toBeNull();
    // Another run's lease is left as it was.
    expect(await leases()).toBe(1);
  });

  it('takes the job over from a run whose lease has run out', async () => {
    await jonasWantsReminders();
    await client.query(
      "insert into job_leases (job, held_until, run_id) values ('reminders', now() - interval '1 minute', gen_random_uuid())",
    );
    expect(await (await cron(good)).json()).toMatchObject({ sent: 1 });
    expect(await leases()).toBe(0);
  });

  it('logs counts only: no address, no secret, no signature', async () => {
    await jonasWantsReminders();
    const since = serverLogSince(serverLogPath);
    await cron(good);
    await cron('Bearer wrong-secret');
    const log = await since('"event":"reminders"');
    expect(log).toContain('"event":"reminders"');
    expect(log).not.toContain('@');
    expect(log).not.toContain(TEST_CRON_SECRET);
    expect(log).not.toContain('wrong-secret');
    expect(log).not.toContain('signature');
  });

  it('is outside the proxy: no cookie is read or written, whatever the request carries', async () => {
    await jonasWantsReminders();
    const answer = await fetch(new URL(CRON, baseUrl), {
      method: 'POST',
      headers: {
        Authorization: good,
        Cookie: '__Host-sb_flash=garbage; __Host-sb_signin_open=login',
      },
    });
    expect(answer.status).toBe(200);
    expect(answer.headers.getSetCookie()).toEqual([]);
  });
});

const signatureOf = (id: number) =>
  unsubscribeSignature(player(String(id)), TEST_AUTH_SECRET);

const pageOf = (id: number, signature: string | null) =>
  `/profile/notifications/unsubscribe/${String(id)}${
    signature === null ? '' : `?signature=${signature}`
  }`;

const confirmOf = (id: number, signature: string | null) =>
  `/profile/notifications/unsubscribe/${String(id)}/confirm${
    signature === null ? '' : `?signature=${signature}`
  }`;

const alertOn = (html: string) =>
  documentOf({
    path: '/',
    status: 200,
    location: null,
    html,
    setCookies: [],
  }).querySelector('[role="alert"], [role="status"]')?.textContent ?? null;

const visitor = () => new Browser(baseUrl, '192.0.2.61');

describe('the unsubscribe page', () => {
  it('shows the confirmation for a good signature, a button posting to the confirm address, and changes nothing', async () => {
    await jonasWantsReminders();
    const page = await visitor().get(pageOf(1, signatureOf(1)));
    expect(page.status).toBe(200);
    const document = documentOf(page);
    expect(document.querySelector('h1')?.textContent).toBe(
      'Atsisakyti priminimų?',
    );
    expect(document.body.textContent).toContain(
      'Daugiau nebegausite priminimų apie neatliktus spėjimus.',
    );
    expect(
      document
        .querySelector('form[action*="/unsubscribe/"]')
        ?.getAttribute('action'),
    ).toBe(confirmOf(1, signatureOf(1)));
    expect(await receives()).toBe(true);
  });

  it('keeps the signature out of Referer and search engines', async () => {
    await jonasWantsReminders();
    const page = await visitor().get(pageOf(1, signatureOf(1)));
    const document = documentOf(page);
    expect(
      document.querySelector('meta[name="referrer"]')?.getAttribute('content'),
    ).toBe('no-referrer');
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute('content'),
    ).toContain('noindex');
  });

  it('says the link no longer works, and changes nothing, for a signature that does not open', async () => {
    await jonasWantsReminders();
    for (const path of [
      pageOf(1, null),
      pageOf(1, 'a'.repeat(64)),
      pageOf(1, `${signatureOf(1)}x`),
      // Zukauskas's signature on Jonas's id.
      pageOf(1, signatureOf(2)),
      pageOf(2, signatureOf(1)),
      pageOf(1, `${signatureOf(1)}&signature=${signatureOf(2)}`),
      '/profile/notifications/unsubscribe/abc?signature=x',
    ]) {
      const page = await visitor().get(path);
      expect(page.status).toBe(200);
      expect(documentOf(page).body.textContent).toContain(
        'Nuoroda nebegalioja.',
      );
      expect(
        documentOf(page).querySelector('form[action*="/unsubscribe/"]'),
      ).toBeNull();
    }
    expect(await receives()).toBe(true);
  });
});

describe('the unsubscribe button and the one-click POST', () => {
  it("the button: 303 home with sportbet's message, shown once, and the setting off for that player only", async () => {
    await jonasWantsReminders();
    await optIn(2);
    const browser = visitor();
    const done = await browser.post(confirmOf(1, signatureOf(1)), undefined, {
      origin: null,
    });
    expect(done.status).toBe(303);
    expect(done.location).toBe('/');
    expect(setCookieFor(done, '__Host-sb_flash')).toBeDefined();
    expect(await receives(1)).toBe(false);
    expect(await receives(2)).toBe(true);
    const home = await browser.get('/');
    expect(alertOn(home.html)).toBe('Pranešimai išjungti sėkmingai.');
    expect(alertOn((await browser.get('/')).html)).toBeNull();
  });

  it('the one-click POST: 200, no redirect, no message, and no Origin or session needed', async () => {
    await jonasWantsReminders();
    const answer = await fetch(new URL(confirmOf(1, signatureOf(1)), baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(answer.status).toBe(200);
    expect(answer.headers.get('location')).toBeNull();
    expect(answer.headers.getSetCookie()).toEqual([]);
    expect(await receives()).toBe(false);
  });

  it('a second press succeeds the same way', async () => {
    await jonasWantsReminders();
    const browser = visitor();
    for (let press = 0; press < 2; press += 1) {
      const done = await browser.post(confirmOf(1, signatureOf(1)));
      expect(done.status).toBe(303);
    }
    expect(await receives()).toBe(false);
  });

  it('a bad signature: 403, nothing changed, for the button and the one-click alike', async () => {
    await jonasWantsReminders();
    for (const path of [
      confirmOf(1, null),
      confirmOf(1, 'a'.repeat(64)),
      confirmOf(1, `${signatureOf(1)}x`),
      confirmOf(1, signatureOf(2)),
      confirmOf(2, signatureOf(1)),
    ]) {
      for (const body of [undefined, 'List-Unsubscribe=One-Click']) {
        const answer = await fetch(new URL(path, baseUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body ?? null,
        });
        expect(answer.status).toBe(403);
        expect(answer.headers.getSetCookie()).toEqual([]);
      }
    }
    expect(await receives(1)).toBe(true);
  });

  it('answers 405 to a GET of the confirm address: opening it changes nothing', async () => {
    await jonasWantsReminders();
    const answer = await visitor().get(confirmOf(1, signatureOf(1)));
    expect(answer.status).toBe(405);
    expect(await receives()).toBe(true);
  });

  it('a deleted account answers as a live one, so nothing says which accounts exist', async () => {
    await jonasWantsReminders();
    const live = await visitor().post(confirmOf(1, signatureOf(1)));
    const gone = await visitor().post(confirmOf(9, signatureOf(9)));
    expect(gone.status).toBe(live.status);
    expect(gone.location).toBe(live.location);
  });
});

describe('the whole journey: the mail, its link, the button', () => {
  it("the link in the reminder opens the page, and the button turns Jonas's reminders off for good", async () => {
    await jonasWantsReminders();
    expect((await cron(good)).status).toBe(200);
    const [mail] = await mailsTo(mailpitUrl, JONAS_EMAIL);
    const link =
      /href="([^"]*\/profile\/notifications\/unsubscribe\/[^"]*)"/.exec(
        mail?.html ?? '',
      )?.[1];
    expect(link).toBeDefined();
    // The link starts at APP_URL; open its path on the server under test.
    const { pathname, search } = new URL(link ?? '');
    const browser = visitor();
    const page = await browser.get(`${pathname}${search}`);
    expect(documentOf(page).querySelector('h1')?.textContent).toBe(
      'Atsisakyti priminimų?',
    );
    expect(await receives()).toBe(true);
    const action = documentOf(page)
      .querySelector('form[action*="/unsubscribe/"]')
      ?.getAttribute('action');
    const done = await browser.post(action ?? '');
    expect(done.status).toBe(303);
    expect(alertOn((await browser.get('/')).html)).toBe(
      'Pranešimai išjungti sėkmingai.',
    );
    expect(await receives()).toBe(false);
    // No further reminder: a new game inside the window sends nothing.
    await client.query(
      'update match_predictions set reminded_at = null where player_id = 1',
    );
    await clearMail(mailpitUrl);
    expect(await (await cron(good)).json()).toMatchObject({ sent: 0 });
    expect(await mailsTo(mailpitUrl, JONAS_EMAIL)).toEqual([]);
  });
});
