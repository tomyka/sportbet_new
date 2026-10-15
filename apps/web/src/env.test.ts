import { describe, expect, it } from 'vitest';
import { feedEnvSchema, mailEnvSchema } from './env';

const FROM = { MAIL_FROM_ADDRESS: 'noreply@sportbet.lt' };
const KEY = { RESEND_API_KEY: 're_test_123' };

describe('mailEnvSchema', () => {
  it('takes Mailpit with its URL', () => {
    expect(
      mailEnvSchema.safeParse({
        MAIL_TRANSPORT: 'mailpit',
        MAILPIT_URL: 'http://mailpit:8025',
        ...FROM,
      }).success,
    ).toBe(true);
  });

  it('refuses Resend without a key, and a key that is not one', () => {
    expect(
      mailEnvSchema.safeParse({ MAIL_TRANSPORT: 'resend', ...FROM }).success,
    ).toBe(false);
    expect(
      mailEnvSchema.safeParse({
        MAIL_TRANSPORT: 'resend',
        RESEND_API_KEY: 'sk_live_1',
        ...FROM,
      }).success,
    ).toBe(false);
  });

  it("reads staging's allow-list as normalized addresses, and refuses an empty or bad one", () => {
    const parsed = mailEnvSchema.parse({
      MAIL_TRANSPORT: 'resend-allow-list',
      MAIL_ALLOWED_RECIPIENTS: ' Owner@Example.LT ,second@example.lt',
      ...KEY,
      ...FROM,
    });
    expect(parsed).toMatchObject({
      MAIL_ALLOWED_RECIPIENTS: ['owner@example.lt', 'second@example.lt'],
    });
    for (const MAIL_ALLOWED_RECIPIENTS of ['', 'owner', 'a@b,,c@d']) {
      expect(
        mailEnvSchema.safeParse({
          MAIL_TRANSPORT: 'resend-allow-list',
          MAIL_ALLOWED_RECIPIENTS,
          ...KEY,
          ...FROM,
        }).success,
      ).toBe(false);
    }
  });

  it('refuses a sender that is not a lower-case address', () => {
    expect(
      mailEnvSchema.safeParse({
        MAIL_TRANSPORT: 'resend',
        ...KEY,
        MAIL_FROM_ADDRESS: 'SportBet <noreply@sportbet.lt>',
      }).success,
    ).toBe(false);
  });
});

// Review W1: each environment mails only the way it is meant to.
describe('mailEnvSchema against SPORTBET_ENV', () => {
  const MAILPIT = {
    MAIL_TRANSPORT: 'mailpit',
    MAILPIT_URL: 'http://mailpit:8025',
    ...FROM,
  };
  const RESEND = { MAIL_TRANSPORT: 'resend', ...KEY, ...FROM };
  const ALLOW_LIST = {
    MAIL_TRANSPORT: 'resend-allow-list',
    MAIL_ALLOWED_RECIPIENTS: 'owner@example.lt',
    ...KEY,
    ...FROM,
  };
  const accepts = (SPORTBET_ENV: string | undefined, mail: object) =>
    mailEnvSchema.safeParse({
      ...mail,
      ...(SPORTBET_ENV === undefined ? {} : { SPORTBET_ENV }),
    }).success;

  it('takes Mailpit only where no real mail may go: unset, local or ci', () => {
    for (const where of [undefined, 'local', 'ci']) {
      expect(accepts(where, MAILPIT)).toBe(true);
    }
  });

  it('refuses on staging anything but Resend to the allow-list', () => {
    expect(accepts('staging', ALLOW_LIST)).toBe(true);
    expect(accepts('staging', RESEND)).toBe(false);
    expect(accepts('staging', MAILPIT)).toBe(false);
  });

  it('refuses on production anything but Resend', () => {
    expect(accepts('production', RESEND)).toBe(true);
    expect(accepts('production', ALLOW_LIST)).toBe(false);
    expect(accepts('production', MAILPIT)).toBe(false);
  });

  it('refuses an environment it does not know', () => {
    expect(accepts('prod', RESEND)).toBe(false);
  });
});

// Slice 15: the import's feed. Deployed environments default to live; ci,
// local and an unset environment must say, so a forgotten setting fails
// closed instead of reaching the live host.
describe('feedEnvSchema', () => {
  const FIXTURE = {
    EUROLEAGUE_FEED: 'fixture',
    EUROLEAGUE_FEED_FIXTURE: '/fixtures/e2026.json',
  };
  const read = (input: Record<string, string>) =>
    feedEnvSchema.safeParse(input);

  it('reads staging and production with nothing set as the live feed', () => {
    for (const SPORTBET_ENV of ['staging', 'production']) {
      expect(read({ SPORTBET_ENV })).toMatchObject({
        success: true,
        data: { EUROLEAGUE_FEED: 'live' },
      });
    }
  });

  it('refuses ci, local and an unset environment with nothing set', () => {
    for (const input of [
      { SPORTBET_ENV: 'ci' },
      { SPORTBET_ENV: 'local' },
      {},
    ]) {
      expect(read(input).success).toBe(false);
    }
  });

  it('still holds a deployed environment to live, whatever is set', () => {
    expect(read({ SPORTBET_ENV: 'staging', ...FIXTURE }).success).toBe(false);
    expect(
      read({ SPORTBET_ENV: 'production', EUROLEAGUE_FEED: 'live' }).success,
    ).toBe(true);
  });

  it('takes explicit values where they are allowed, and the fixture only with its path', () => {
    expect(read({ SPORTBET_ENV: 'ci', ...FIXTURE }).success).toBe(true);
    expect(
      read({ SPORTBET_ENV: 'local', EUROLEAGUE_FEED: 'live' }).success,
    ).toBe(true);
    expect(
      read({ SPORTBET_ENV: 'ci', EUROLEAGUE_FEED: 'fixture' }).success,
    ).toBe(false);
    expect(read({ SPORTBET_ENV: 'ci', EUROLEAGUE_FEED: 'live' }).success).toBe(
      false,
    );
  });
});
