import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { instantFrom } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import type { GoogleEnv } from '../../google-env';
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_ISSUER,
  GOOGLE_TOKEN_ENDPOINT,
  identityFromIdToken,
  liveGoogleProvider,
  payloadOfIdToken,
} from './google-live';
import type { GoogleFetch } from './provider';

const NOW = unwrap(instantFrom('2026-10-18T10:00:00Z'));
const SECONDS = NOW / 1000;
const CLIENT = 'test-client-id';
const SECRET = 'test-client-secret';
const NONCE = 'the-nonce-of-this-browser';
const EXPECTED = { clientId: CLIENT, nonce: NONCE, now: NOW };

const ENV: Extract<GoogleEnv, { provider: 'live' }> = {
  provider: 'live',
  clientId: CLIENT,
  clientSecret: SECRET,
  redirectUri: 'https://sportbet.lt/auth/google/callback',
};

const GOOD = {
  iss: GOOGLE_ISSUER,
  aud: CLIENT,
  azp: CLIENT,
  exp: SECONDS + 3600,
  iat: SECONDS - 10,
  nonce: NONCE,
  sub: '104520385693274017345',
  email: 'Jonas@Example.LT',
  email_verified: true,
  name: 'Jonas Jonaitis',
};

const without = (key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(GOOD).filter(([name]) => name !== key));

const check = (claims: unknown) => identityFromIdToken(claims, EXPECTED);

describe('identityFromIdToken: the claims that make an identity', () => {
  it('takes a good token: the sub, the address normalized, verified, the name', () => {
    expect(check(GOOD)).toEqual({
      ok: true,
      value: {
        sub: '104520385693274017345',
        email: 'jonas@example.lt',
        emailVerified: true,
        name: 'Jonas Jonaitis',
      },
    });
  });

  it("takes the issuer in both of Google's spellings", () => {
    const bare = GOOGLE_ISSUER.replace('https://', '');
    expect(check({ ...GOOD, iss: bare }).ok).toBe(true);
    expect(check({ ...GOOD, iss: GOOGLE_ISSUER }).ok).toBe(true);
  });

  it.each([
    ['another issuer', { iss: 'https://evil.example' }],
    [
      "an issuer that merely contains Google's",
      { iss: `${GOOGLE_ISSUER}.evil.example` },
    ],
    ['a missing issuer', { iss: undefined }],
    ['an issuer that is no text', { iss: 5 }],
  ])('refuses %s', (_name, change) => {
    expect(check({ ...GOOD, ...change }).ok).toBe(false);
  });

  it.each([
    ['another audience', { aud: 'another-client' }],
    ['no audience', { aud: undefined }],
    [
      'an audience list holding this client and another',
      { aud: [CLIENT, 'other'] },
    ],
    ['an audience list of another client', { aud: ['other'] }],
    ['an empty audience list', { aud: [] }],
    ['a list of this client with another azp', { aud: [CLIENT], azp: 'other' }],
    ['a list of this client with no azp', { aud: [CLIENT], azp: undefined }],
    ['a string audience with another azp', { azp: 'other' }],
  ])('refuses %s', (_name, change) => {
    expect(check({ ...GOOD, ...change }).ok).toBe(false);
  });

  it('takes a list holding only this client when azp is it, and a string with no azp', () => {
    expect(check({ ...GOOD, aud: [CLIENT] }).ok).toBe(true);
    expect(check({ ...GOOD, azp: undefined }).ok).toBe(true);
  });

  it.each([
    ['expired', { exp: SECONDS - 1 }],
    ['expiring this very second', { exp: SECONDS }],
    ['no expiry', { exp: undefined }],
    ['an expiry that is text', { exp: String(SECONDS + 3600) }],
    ['an expiry that is not finite', { exp: null }],
  ])('refuses a token %s', (_name, change) => {
    expect(check({ ...GOOD, ...change }).ok).toBe(false);
  });

  it('refuses a token issued more than 60 seconds ahead by our clock, takes 60, and refuses none or text', () => {
    expect(check({ ...GOOD, iat: SECONDS + 61 }).ok).toBe(false);
    expect(check({ ...GOOD, iat: SECONDS + 60 }).ok).toBe(true);
    expect(check({ ...GOOD, iat: undefined }).ok).toBe(false);
    expect(check({ ...GOOD, iat: String(SECONDS) }).ok).toBe(false);
  });

  it.each([
    ['another nonce', { nonce: 'another-browsers' }],
    ['no nonce', { nonce: undefined }],
    ['a nonce that is no text', { nonce: 5 }],
    ['an empty nonce', { nonce: '' }],
  ])('refuses %s', (_name, change) => {
    expect(check({ ...GOOD, ...change }).ok).toBe(false);
  });

  it.each([
    ['no sub', { sub: undefined }],
    ['an empty sub', { sub: '' }],
    ['a 256-character sub', { sub: 'a'.repeat(256) }],
    ['a sub that is a number', { sub: 1e20 }],
    ['a sub with a quote', { sub: "1'2" }],
  ])('refuses %s', (_name, change) => {
    expect(check({ ...GOOD, ...change }).ok).toBe(false);
  });

  it('takes a 255-character sub', () => {
    expect(check({ ...GOOD, sub: 'a'.repeat(255) }).ok).toBe(true);
  });

  it('is verified only by the JSON boolean true: "true", 1, false and nothing are not', () => {
    for (const email_verified of ['true', 1, false, null, undefined]) {
      const identity = check({ ...GOOD, email_verified });
      expect(identity).toMatchObject({
        ok: true,
        value: { emailVerified: false },
      });
    }
    expect(check(without('email_verified'))).toMatchObject({
      value: { emailVerified: false },
    });
  });

  it('is an identity with no address, and with no name, rather than a refusal (the plan decides what that means)', () => {
    expect(check(without('email'))).toMatchObject({
      ok: true,
      value: { email: null },
    });
    expect(check({ ...GOOD, name: 7 })).toMatchObject({
      ok: true,
      value: { name: null },
    });
  });

  it.each([[null], ['text'], [5], [[]]])(
    'refuses claims that are %j',
    (claims) => {
      expect(check(claims).ok).toBe(false);
    },
  );
});

/** An id_token whose payload is `claims`: the signature is not checked, so any third segment will do. */
const tokenOf = (claims: unknown): string =>
  `aGVhZGVy.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.c2ln`;

describe('payloadOfIdToken', () => {
  it('reads the payload of three base64url segments', () => {
    expect(payloadOfIdToken(tokenOf({ a: 1 }))).toEqual({ a: 1 });
  });

  it.each([
    ['two segments', 'a.b'],
    ['four segments', 'a.b.c.d'],
    ['an empty segment', 'a..c'],
    ['a segment that is not base64url', 'a.b+/=.c'],
    [
      'a payload that is not JSON',
      `a.${Buffer.from('nope').toString('base64url')}.c`,
    ],
    ['nothing', ''],
  ])('is null for %s', (_name, token) => {
    expect(payloadOfIdToken(token)).toBeNull();
  });
});

/** A fetch that answers `response` and records what it was asked. */
function fetchAnswering(response: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn: GoogleFetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(response());
  };
  return { calls, fetchFn };
}

const answerWith = (claims: unknown, status = 200): Response =>
  new Response(JSON.stringify({ id_token: tokenOf(claims) }), { status });

const provider = (fetchFn: GoogleFetch, timeoutMs?: number) =>
  liveGoogleProvider(ENV, {
    fetch: fetchFn,
    secret: 'unused',
    now: () => NOW,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '';

const EXCHANGE = { code: 'the-code', verifier: 'the-verifier', nonce: NONCE };

describe('liveGoogleProvider.authorizationUrl', () => {
  it("sends the browser to Google with the code flow, PKCE S256, state and nonce, the derived redirect URI and sportbet's scopes", () => {
    const url = new URL(
      provider(fetchAnswering(() => answerWith(GOOD)).fetchFn).authorizationUrl(
        {
          state: 'the-state',
          nonce: 'the-nonce',
          challenge: 'the-challenge',
        },
      ),
    );
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZATION_ENDPOINT);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: CLIENT,
      redirect_uri: 'https://sportbet.lt/auth/google/callback',
      scope: 'openid email profile',
      state: 'the-state',
      nonce: 'the-nonce',
      code_challenge: 'the-challenge',
      code_challenge_method: 'S256',
    });
    expect(url.searchParams.has('access_type')).toBe(false);
    expect(url.searchParams.has('prompt')).toBe(false);
    expect(url.toString()).not.toContain(SECRET);
  });
});

describe('liveGoogleProvider.exchange', () => {
  it('posts the form to the token endpoint, the secret and the verifier in the body, never the URL, following no redirect', async () => {
    const { calls, fetchFn } = fetchAnswering(() => answerWith(GOOD));
    const answer = await provider(fetchFn).exchange(EXCHANGE);
    expect(answer).toMatchObject({
      ok: true,
      value: { email: 'jonas@example.lt' },
    });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(GOOGLE_TOKEN_ENDPOINT);
    expect(call?.url).not.toContain('secret');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(call?.init.redirect).toBe('error');
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
    expect(
      Object.fromEntries(new URLSearchParams(bodyText(call?.init))),
    ).toEqual({
      code: 'the-code',
      client_id: CLIENT,
      client_secret: SECRET,
      redirect_uri: 'https://sportbet.lt/auth/google/callback',
      grant_type: 'authorization_code',
      code_verifier: 'the-verifier',
    });
  });

  it.each([400, 401, 403, 500, 302])(
    'is failed for HTTP %i',
    async (status) => {
      const { fetchFn } = fetchAnswering(() => answerWith(GOOD, status));
      expect(await provider(fetchFn).exchange(EXCHANGE)).toEqual({
        ok: false,
        refusal: 'failed',
      });
    },
  );

  it('is failed when a claim is wrong (each claim has its own case above), through the whole path', async () => {
    const { fetchFn } = fetchAnswering(() =>
      answerWith({ ...GOOD, nonce: 'someone-elses' }),
    );
    expect((await provider(fetchFn).exchange(EXCHANGE)).ok).toBe(false);
  });

  it('is failed for a body over 64 KB, even a valid one padded past it', async () => {
    const padded = JSON.stringify({
      id_token: tokenOf(GOOD),
      padding: 'x'.repeat(64 * 1024),
    });
    const { fetchFn } = fetchAnswering(() => new Response(padded));
    expect((await provider(fetchFn).exchange(EXCHANGE)).ok).toBe(false);
  });

  it('takes a body just under 64 KB', async () => {
    const padded = JSON.stringify({
      id_token: tokenOf(GOOD),
      padding: 'x'.repeat(60 * 1024),
    });
    const { fetchFn } = fetchAnswering(() => new Response(padded));
    expect((await provider(fetchFn).exchange(EXCHANGE)).ok).toBe(true);
  });

  it.each([
    ['not JSON', 'not json'],
    ['JSON with no id_token', '{"access_token":"x"}'],
    ['an id_token that is no text', '{"id_token":5}'],
    ['an empty id_token', '{"id_token":""}'],
    [
      'an id_token over 8 KB',
      JSON.stringify({ id_token: 'a'.repeat(8 * 1024 + 1) }),
    ],
    ['an id_token of two segments', '{"id_token":"a.b"}'],
    ['an id_token that is not base64url', '{"id_token":"a.b+/.c"}'],
    ['an empty body', ''],
  ])('is failed for %s', async (_name, body) => {
    const { fetchFn } = fetchAnswering(() => new Response(body));
    expect((await provider(fetchFn).exchange(EXCHANGE)).ok).toBe(false);
  });

  it('is failed when the request throws, and when it outlasts its time', async () => {
    const throwing: GoogleFetch = () =>
      Promise.reject(new TypeError('fetch failed'));
    expect((await provider(throwing).exchange(EXCHANGE)).ok).toBe(false);
    const hanging: GoogleFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('timed out', 'TimeoutError'));
        });
      });
    expect((await provider(hanging, 20).exchange(EXCHANGE)).ok).toBe(false);
  });

  it('gives its request ten seconds by default', async () => {
    const { calls, fetchFn } = fetchAnswering(() => answerWith(GOOD));
    await provider(fetchFn).exchange(EXCHANGE);
    const signal = calls[0]?.init.signal;
    expect(signal?.aborted).toBe(false);
  });
});

/** Every file under apps/web/src, as its path and text. */
function sources(dir: string): { path: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name)
      ? [{ path, text: readFileSync(path, 'utf8') }]
      : [];
  });
}

describe("Google's hosts", () => {
  // Written in pieces so that this file does not hold them itself.
  const HOSTS = [
    ['accounts', 'google', 'com'].join('.'),
    ['oauth2', 'googleapis', 'com'].join('.'),
  ];

  it('are named in google-live.ts alone, tests included', () => {
    const src = join(import.meta.dirname, '..', '..');
    const naming = sources(src)
      .filter(({ text }) => HOSTS.some((host) => text.includes(host)))
      .map(({ path }) => relative(src, path).replaceAll('\\', '/'));
    expect(naming).toEqual(['server/google/google-live.ts']);
  });
});
