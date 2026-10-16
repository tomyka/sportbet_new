import { expect, it } from 'vitest';
import {
  EUROLEAGUE_FIXTURE,
  runServerUntilExit,
  startServer,
} from '../support/app';

it('refuses to start without DATABASE_URL, naming it', async () => {
  const { code, output } = await runServerUntilExit({});
  expect(code).toBe(1);
  expect(output).toContain('Invalid environment');
  expect(output).toContain('DATABASE_URL');
});

it('refuses to start with a DATABASE_URL that is not a Postgres URL', async () => {
  const { code, output } = await runServerUntilExit({
    DATABASE_URL: 'mysql://x@y/z',
  });
  expect(code).toBe(1);
  expect(output).toContain('DATABASE_URL');
});

it('refuses to start with an ADSENSE_CLIENT that is not a publisher id, naming it', async () => {
  const { code, output } = await runServerUntilExit({
    DATABASE_URL: 'postgres://sportbet@127.0.0.1:1/sportbet',
    ADSENSE_CLIENT: 'pub-7290396604686794',
  });
  expect(code).toBe(1);
  expect(output).toContain('Invalid environment');
  expect(output).toContain('ADSENSE_CLIENT');
});

/** A server environment that would start, but for what each test takes out or breaks. */
const VALID: Readonly<Record<string, string>> = {
  DATABASE_URL: 'postgres://sportbet@127.0.0.1:1/sportbet',
  AUTH_SECRET: 'startup-tests-only-not-a-secret-0123456789',
  MAIL_TRANSPORT: 'mailpit',
  MAILPIT_URL: 'http://127.0.0.1:1',
  MAIL_FROM_ADDRESS: 'noreply@sportbet.test',
  EUROLEAGUE_FEED: 'fixture',
  EUROLEAGUE_FEED_FIXTURE: EUROLEAGUE_FIXTURE,
};

const without = (name: string) =>
  Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== name));

it('refuses to start without AUTH_SECRET, naming it', async () => {
  const { code, output } = await runServerUntilExit(without('AUTH_SECRET'));
  expect(code).toBe(1);
  expect(output).toContain('AUTH_SECRET');
});

it('refuses to start with Resend and no key, naming RESEND_API_KEY', async () => {
  const { code, output } = await runServerUntilExit({
    ...without('MAILPIT_URL'),
    MAIL_TRANSPORT: 'resend',
  });
  expect(code).toBe(1);
  expect(output).toContain('RESEND_API_KEY');
});

it("refuses to start with staging's allow-list and no address on it, naming MAIL_ALLOWED_RECIPIENTS", async () => {
  const { code, output } = await runServerUntilExit({
    ...without('MAILPIT_URL'),
    MAIL_TRANSPORT: 'resend-allow-list',
    RESEND_API_KEY: 're_test_123',
  });
  expect(code).toBe(1);
  expect(output).toContain('MAIL_ALLOWED_RECIPIENTS');
});

// Slice 15: the import's feed, held to SPORTBET_ENV like the mail transport.
it('refuses to start without EUROLEAGUE_FEED under ci or local, naming it', async () => {
  for (const SPORTBET_ENV of ['ci', 'local']) {
    const { code, output } = await runServerUntilExit({
      ...without('EUROLEAGUE_FEED'),
      SPORTBET_ENV,
    });
    expect(code).toBe(1);
    expect(output).toContain('EUROLEAGUE_FEED');
  }
});

it('refuses to start without EUROLEAGUE_FEED, naming it', async () => {
  const { code, output } = await runServerUntilExit(without('EUROLEAGUE_FEED'));
  expect(code).toBe(1);
  expect(output).toContain('EUROLEAGUE_FEED');
});

it('refuses to start with the fixture feed and no fixture, naming EUROLEAGUE_FEED_FIXTURE', async () => {
  const { code, output } = await runServerUntilExit(
    without('EUROLEAGUE_FEED_FIXTURE'),
  );
  expect(code).toBe(1);
  expect(output).toContain('EUROLEAGUE_FEED_FIXTURE');
});

it('refuses to start reading the live feed under SPORTBET_ENV=ci, naming EUROLEAGUE_FEED', async () => {
  const { code, output } = await runServerUntilExit({
    ...VALID,
    SPORTBET_ENV: 'ci',
    EUROLEAGUE_FEED: 'live',
  });
  expect(code).toBe(1);
  expect(output).toContain('EUROLEAGUE_FEED');
});

it('refuses to start on staging with the fixture feed, naming EUROLEAGUE_FEED', async () => {
  const { code, output } = await runServerUntilExit({
    ...VALID,
    SPORTBET_ENV: 'staging',
    MAIL_TRANSPORT: 'resend-allow-list',
    RESEND_API_KEY: 're_test_123',
    MAIL_ALLOWED_RECIPIENTS: 'owner@example.lt',
  });
  expect(code).toBe(1);
  expect(output).toContain('EUROLEAGUE_FEED');
});

// Slice 16 (R-97): the cron route's secret and the site's address are read
// lazily by the cron route alone. A missing or bad one must never stop the
// site (the edge-runtime lesson of slice 15): the server starts, and only the
// cron route answers 503.
const BAD_REMINDER_SETTINGS: readonly Record<string, string>[] = [
  { SPORTBET_ENV: 'ci' },
  { CRON_SECRET: 'too-short' },
  { APP_URL: 'https://sportbet.lt/path' },
  { SPORTBET_ENV: 'ci', CRON_SECRET: 'x'.repeat(40), APP_URL: 'http://a.test' },
];

it.each(BAD_REMINDER_SETTINGS)(
  'starts with the reminder settings %j, and only the cron route answers 503',
  async (settings) => {
    const server = await startServer({ ...VALID, ...settings });
    try {
      const cron = await fetch(`${server.url}/api/cron/reminders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${'x'.repeat(40)}` },
      });
      expect(cron.status).toBe(503);
      // The site itself answers (here 503 only because the database is not there).
      const health = await fetch(`${server.url}/api/health`);
      expect(health.status).toBe(503);
      expect(await health.json()).toEqual({ status: 'unavailable' });
    } finally {
      await server.stop();
    }
  },
);
