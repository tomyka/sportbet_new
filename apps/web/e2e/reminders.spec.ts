import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import { mailsTo, type HeldMail } from '../tests/support/mailpit';
import { answerCookies, scrollsSideways } from './support/newcomer';
import { SAVININKAS, savininkasContext } from './support/savininkas';

// Prediction reminders (slice 16, #33, R-97, R-98) against the E2E stack:
// the seeded account is opted in (a new account is, R-97) and has a blank row
// for round 5's game 9003, which the admin moves to 30 minutes from now, so
// the reminder is due; the cron route is called with the stack's own secret
// (infra/compose/e2e.yml) and Mailpit receives the mail. A signed-out visitor
// opens the mail's link, presses "Atsisakyti", and sees sportbet's message
// once; the one-click address from the mail's header turns the setting off
// with one POST. At a desktop and a phone width. Nothing leaves the stack:
// the mailer is Mailpit.

const MAILPIT = process.env['E2E_MAILPIT_URL'] ?? '';

/** The stack's CRON_SECRET: a value that exists only in infra/compose/e2e.yml. */
const CRON_SECRET = 'e2e-stack-only-cron-not-a-secret-0123456789';

const TOURNAMENT = 'Euroleague 2026/27';
const GAME = '9003';
/** 9003's seeded tip-off, 2027-03-10T18:00Z, as the admin types it: Vilnius time. */
const SEEDED_TIME = '2027-03-10T19:00';

test.describe.configure({ mode: 'serial' });

const DESKTOP = { width: 1280, height: 800, ip: '192.0.2.111' } as const;
const PHONE = { width: 390, height: 844, ip: '192.0.2.112' } as const;

/** The page of the mail's unsubscribe link, as a path on the stack under test (the mail's origin is APP_URL), kept for the phone's run. */
let unsubscribePath = '';

const said = (page: Page, text: string | RegExp) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();

/** `YYYY-MM-DDTHH:mm` on Vilnius's wall clock, `minutes` from now: the form the admin types. */
function vilniusIn(minutes: number): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(Date.now() + minutes * 60_000));
  return parts.replace(' ', 'T');
}

/** The admin works on the seeded tournament ("▶ Kontekstas"): another may be chosen. */
async function work(page: Page): Promise<void> {
  await page.goto('/admin/tournaments');
  await page
    .getByTestId('tournament-row')
    .filter({ hasText: TOURNAMENT })
    .getByRole('button', { name: '▶ Kontekstas' })
    .click();
  await expect(page).toHaveURL('/admin/index');
  await said(page, `Turnyro kontekstas: ${TOURNAMENT}`);
}

/** The game's time typed in its modal. */
async function moveGame(page: Page, time: string): Promise<void> {
  await page.goto('/admin/games');
  await page
    .getByRole('button', { name: `Redaguoti žaidimą #${GAME}` })
    .click();
  const dialog = page.getByRole('dialog', {
    name: `Redaguoti žaidimą #${GAME}`,
  });
  await dialog.getByLabel('Data ir laikas').fill(time);
  await dialog.getByRole('button', { name: 'Išsaugoti' }).click();
  await said(page, `Žaidimas #${GAME} atnaujintas.`);
}

const callCron = (request: APIRequestContext) =>
  request.post('/api/cron/reminders', {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

/** The reminders Mailpit holds for the seeded account. */
const reminders = async () =>
  (await mailsTo(MAILPIT, SAVININKAS.email)).filter(({ subject }) =>
    subject.startsWith('Prognozė'),
  );

/** A signed-out visitor, at `size`, the cookie bar answered. */
async function visitor(
  browser: Browser,
  size: typeof DESKTOP | typeof PHONE,
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    extraHTTPHeaders: { 'x-forwarded-for': size.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await answerCookies(page);
  return page;
}

/** The confirmation, pressed: home with sportbet's message, once. */
async function pressUnsubscribe(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Atsisakyti priminimų?' }),
  ).toBeVisible();
  await expect(
    page.getByText('Daugiau nebegausite priminimų apie neatliktus spėjimus.'),
  ).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  await page.getByRole('button', { name: 'Atsisakyti', exact: true }).click();
  await expect(page).toHaveURL('/');
  await said(page, 'Pranešimai išjungti sėkmingai.');
  await page.reload();
  await expect(
    page.getByRole('status').filter({ hasText: 'Pranešimai išjungti' }),
  ).toHaveCount(0);
}

/** An unsubscribe address as the mail writes it: APP_URL's origin, the player, the signature. */
const UNSUBSCRIBE_ADDRESS =
  /^http:\/\/localhost:3000\/profile\/notifications\/unsubscribe\/\d+(\/confirm)?\?signature=[\w.-]+$/;

/** The footer's "Atsisakyti priminimų" link in the mail's HTML. */
const FOOTER_LINK =
  /href="([^"]*\/profile\/notifications\/unsubscribe\/[^"]*)"/;

const NOTHING_SENT = {
  sent: 0,
  refused: 0,
  failed: 0,
  unmarked: 0,
  stale: 0,
  deferred: 0,
};

/** The route refuses a request with no secret, or the wrong one, and any method but POST. */
async function refusesStrangers(request: APIRequestContext): Promise<void> {
  expect((await request.post('/api/cron/reminders')).status()).toBe(401);
  expect(
    (
      await request.post('/api/cron/reminders', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get('/api/cron/reminders')).status()).toBe(405);
  expect(await reminders()).toEqual([]);
}

/**
 * The admin moves 9003 to 30 minutes from now, so the seeded account's
 * reminder is due; the route sends it once, and the next run nothing (the
 * row is marked); the game goes back to its seeded time.
 */
async function sendDueReminder(
  browser: Browser,
  request: APIRequestContext,
): Promise<void> {
  const admin = await savininkasContext(
    browser,
    { width: DESKTOP.width, height: DESKTOP.height },
    DESKTOP.ip,
  );
  const page = await admin.newPage();
  await work(page);
  await moveGame(page, vilniusIn(30));
  try {
    const answer = await callCron(request);
    expect(answer.status()).toBe(200);
    expect(await answer.json()).toEqual({ ...NOTHING_SENT, sent: 1 });
    expect(await (await callCron(request)).json()).toEqual(NOTHING_SENT);
  } finally {
    await moveGame(page, SEEDED_TIME);
    await admin.close();
  }
}

/** A path and query on the stack under test, from a mail's address (its origin is APP_URL). */
function pathOf(address: string | undefined): string {
  const url = new URL(address ?? '');
  return `${url.pathname}${url.search}`;
}

/** The one reminder Mailpit holds for the seeded account. */
async function onlyReminder(): Promise<HeldMail> {
  const [mail, ...others] = await reminders();
  if (mail === undefined) throw new Error('no reminder was mailed');
  expect(others).toEqual([]);
  return mail;
}

/** The mail's headers: RFC 8058's pair, whose List-Unsubscribe address is returned as a path on the stack. */
function oneClickPathOf(mail: HeldMail): string {
  expect(mail.headers['List-Unsubscribe-Post']).toEqual([
    'List-Unsubscribe=One-Click',
  ]);
  const [header = ''] = mail.headers['List-Unsubscribe'] ?? [];
  const address = /^<(.+)>$/.exec(header)?.[1];
  expect(address).toMatch(UNSUBSCRIBE_ADDRESS);
  return pathOf(address);
}

/** The mail's footer link, "Atsisakyti priminimų", as a path on the stack. */
function footerPathOf(mail: HeldMail): string {
  const address = FOOTER_LINK.exec(mail.html)?.[1];
  expect(address).toMatch(UNSUBSCRIBE_ADDRESS);
  return pathOf(address);
}

/** The mail: sportbet's subject for the game, its heading, and where its footer link and its List-Unsubscribe lead. */
function addressesOf(mail: HeldMail): {
  readonly page: string;
  readonly oneClick: string;
} {
  expect(mail.subject).toMatch(
    /^Prognozė: Olympiacos vs Panathinaikos - \d{2}:\d{2} LT$/,
  );
  expect(mail.html).toContain('Nepamirškite prognozuoti!');
  return { page: footerPathOf(mail), oneClick: oneClickPathOf(mail) };
}

test('a due reminder is mailed with both headers, and its link and the one-click POST turn reminders off (desktop)', async ({
  browser,
  request,
}) => {
  // The admin's edit twice, a mail in between, and two pages.
  test.setTimeout(240_000);
  await refusesStrangers(request);
  await sendDueReminder(browser, request);

  const addresses = addressesOf(await onlyReminder());
  unsubscribePath = addresses.page;

  // A signed-out visitor opens the mail's link: the page changes nothing until its button.
  const visit = await visitor(browser, DESKTOP);
  await visit.goto(unsubscribePath);
  await pressUnsubscribe(visit);
  await visit.context().close();

  // The one-click POST, as a mail provider sends it: no page, no Origin, 200.
  const posted = await request.post(addresses.oneClick, {
    form: { 'List-Unsubscribe': 'One-Click' },
  });
  expect(posted.status()).toBe(200);
});

test('the link opens on a phone, the button works, and a link that does not open says so (phone)', async ({
  browser,
}) => {
  expect(unsubscribePath).not.toBe('');
  const visit = await visitor(browser, PHONE);
  await visit.goto(unsubscribePath);
  // Pressing again succeeds the same way: the setting is already off.
  await pressUnsubscribe(visit);

  await visit.goto(
    unsubscribePath.replace(/signature=.*$/, 'signature=not-a-signature'),
  );
  await expect(visit.getByText('Nuoroda nebegalioja.')).toBeVisible();
  await expect(visit.getByRole('button', { name: 'Atsisakyti' })).toHaveCount(
    0,
  );
  await visit.getByRole('link', { name: 'Prisijungti' }).last().click();
  await expect(
    visit.getByRole('dialog', { name: 'Prisijungti' }),
  ).toBeVisible();
  await visit.context().close();
});
