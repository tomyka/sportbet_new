import { expect, it } from 'vitest';
import { runServerUntilExit } from '../support/app';

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
