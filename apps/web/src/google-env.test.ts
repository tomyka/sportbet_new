import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleEnv } from './google-env';

const ID = 'test-client-id';
const SECRET = 'test-client-secret';

const LIVE = { GOOGLE_CLIENT_ID: ID, GOOGLE_CLIENT_SECRET: SECRET };

afterEach(() => {
  vi.restoreAllMocks();
});

const quiet = () =>
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

// Slice 19 (#40): the Google keys, read lazily by the Google routes alone.
describe('googleEnv: deployed (staging, production)', () => {
  it.each(['staging', 'production'])(
    'on %s: the id and secret are required, GOOGLE_PROVIDER may be left out (live) or say live, and APP_URL is the https redirect base',
    (SPORTBET_ENV) => {
      const base = { SPORTBET_ENV, APP_URL: 'https://sportbet.lt', ...LIVE };
      const expected = {
        provider: 'live',
        clientId: ID,
        clientSecret: SECRET,
        redirectUri: 'https://sportbet.lt/auth/google/callback',
      };
      expect(googleEnv(base)).toEqual(expected);
      expect(googleEnv({ ...base, GOOGLE_PROVIDER: 'live' })).toEqual(expected);
    },
  );

  it.each(['staging', 'production'])(
    'on %s: the fixture is refused, whatever else is set',
    (SPORTBET_ENV) => {
      quiet();
      expect(
        googleEnv({
          SPORTBET_ENV,
          APP_URL: 'https://sportbet.lt',
          GOOGLE_PROVIDER: 'fixture',
          ...LIVE,
        }),
      ).toBeUndefined();
      expect(
        googleEnv({
          SPORTBET_ENV,
          APP_URL: 'https://sportbet.lt',
          GOOGLE_PROVIDER: 'fixture',
        }),
      ).toBeUndefined();
    },
  );

  it.each([
    ['no id', { GOOGLE_CLIENT_SECRET: SECRET }],
    ['no secret', { GOOGLE_CLIENT_ID: ID }],
    ['an empty id', { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: SECRET }],
    ['an empty secret', { GOOGLE_CLIENT_ID: ID, GOOGLE_CLIENT_SECRET: '' }],
  ])('on staging: %s is not configured', (_name, keys) => {
    quiet();
    expect(
      googleEnv({
        SPORTBET_ENV: 'staging',
        APP_URL: 'https://staging.sportbet.lt',
        ...keys,
      }),
    ).toBeUndefined();
  });

  it('is not configured without APP_URL, or with one that is no https origin, where deployed', () => {
    quiet();
    for (const APP_URL of [
      undefined,
      'http://sportbet.lt',
      'https://sportbet.lt/path',
      'https://sportbet.lt/',
      'http://localhost',
    ]) {
      expect(
        googleEnv({
          SPORTBET_ENV: 'production',
          ...(APP_URL === undefined ? {} : { APP_URL }),
          ...LIVE,
        }),
      ).toBeUndefined();
    }
  });
});

describe('googleEnv: ci, local and unset (GOOGLE_PROVIDER required and explicit)', () => {
  it.each(['ci', 'local', undefined])(
    'with SPORTBET_ENV %s: nothing says which provider is not configured, failing closed',
    (SPORTBET_ENV) => {
      quiet();
      expect(
        googleEnv({
          ...(SPORTBET_ENV === undefined ? {} : { SPORTBET_ENV }),
          APP_URL: 'http://localhost:3000',
          ...LIVE,
        }),
      ).toBeUndefined();
      expect(googleEnv({})).toBeUndefined();
    },
  );

  it.each(['ci', 'local', undefined])(
    'with SPORTBET_ENV %s: the fixture needs no id, secret or APP_URL',
    (SPORTBET_ENV) => {
      expect(
        googleEnv({
          ...(SPORTBET_ENV === undefined ? {} : { SPORTBET_ENV }),
          GOOGLE_PROVIDER: 'fixture',
        }),
      ).toEqual({ provider: 'fixture' });
    },
  );

  it('rejects a bad APP_URL under the fixture too, and an unknown provider', () => {
    quiet();
    expect(
      googleEnv({ GOOGLE_PROVIDER: 'fixture', APP_URL: 'not a url' }),
    ).toBeUndefined();
    expect(googleEnv({ GOOGLE_PROVIDER: 'mock' })).toBeUndefined();
  });

  it('live needs the id, the secret and an APP_URL; http://localhost is allowed where nothing is deployed', () => {
    quiet();
    const base = {
      SPORTBET_ENV: 'local',
      GOOGLE_PROVIDER: 'live',
      APP_URL: 'http://localhost:3000',
    };
    expect(googleEnv({ ...base, ...LIVE })).toEqual({
      provider: 'live',
      clientId: ID,
      clientSecret: SECRET,
      redirectUri: 'http://localhost:3000/auth/google/callback',
    });
    expect(googleEnv(base)).toBeUndefined();
    expect(
      googleEnv({ SPORTBET_ENV: 'local', GOOGLE_PROVIDER: 'live', ...LIVE }),
    ).toBeUndefined();
  });
});

describe("googleEnv: the environment of Vercel's edge runtime and what it logs", () => {
  it('reads an env object that is not a plain object, key by key', () => {
    class EdgeEnv {
      SPORTBET_ENV = 'staging';
      APP_URL = 'https://staging.sportbet.lt';
      GOOGLE_CLIENT_ID = ID;
      GOOGLE_CLIENT_SECRET = SECRET;
    }
    expect(googleEnv(new EdgeEnv())).toMatchObject({
      provider: 'live',
      redirectUri: 'https://staging.sportbet.lt/auth/google/callback',
    });
    quiet();
    const bare: unknown = Object.create(null);
    expect(
      googleEnv(typeof bare === 'object' && bare !== null ? bare : {}),
    ).toBeUndefined();
  });

  it('logs the names of what is wrong, once, and never a value', () => {
    const log = quiet();
    expect(
      googleEnv({
        SPORTBET_ENV: 'production',
        APP_URL: 'https://sportbet.lt',
        GOOGLE_CLIENT_ID: ID,
        GOOGLE_CLIENT_SECRET: '',
      }),
    ).toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toBe('google: not configured (GOOGLE_CLIENT_SECRET)');
    expect(line).not.toContain(ID);
  });
});
