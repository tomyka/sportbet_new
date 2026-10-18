import { instantFrom } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { seal } from '../sealed';
import {
  FIXTURE_PATH,
  fixtureCode,
  type FixtureClaims,
  fixtureGoogleProvider,
} from './google-fixture';
import { challengeOf } from './pkce';

const SECRET = 'google-fixture-tests-only-not-a-secret-01';
const AT = unwrap(instantFrom('2026-10-18T10:00:00Z'));
const VERIFIER = 'a-verifier-of-this-trip';
const NONCE = 'the-nonce';

const CLAIMS: FixtureClaims = {
  sub: '100000000000000000001',
  email: 'New.Person@Example.test',
  emailVerified: true,
  name: 'Nauja Žaidėja',
};

const provider = (now = AT) =>
  fixtureGoogleProvider({ secret: SECRET, now: () => now });

const codeFor = (claims = CLAIMS, challenge = challengeOf(VERIFIER)) =>
  fixtureCode({ claims, challenge, nonce: NONCE }, SECRET, AT);

const exchange = (code: string, verifier = VERIFIER, nonce = NONCE) =>
  provider().exchange({ code, verifier, nonce });

describe('the fixture provider (never for people: env refuses it where deployed)', () => {
  it("sends the browser to its own consent page with the trip's three values", () => {
    const url = new URL(
      provider().authorizationUrl({ state: 's', nonce: 'n', challenge: 'c' }),
      'http://x.test',
    );
    expect(url.pathname).toBe(FIXTURE_PATH);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      state: 's',
      nonce: 'n',
      challenge: 'c',
    });
  });

  it('gives the identity of a code made for this trip, the address normalized', async () => {
    expect(await exchange(codeFor())).toEqual({
      ok: true,
      value: {
        sub: '100000000000000000001',
        email: 'new.person@example.test',
        emailVerified: true,
        name: 'Nauja Žaidėja',
      },
    });
  });

  it('carries an unverified claim, a missing address and a string "true" as the domain reads them', async () => {
    for (const emailVerified of [false, 'true', undefined]) {
      expect(
        await exchange(codeFor({ ...CLAIMS, emailVerified })),
      ).toMatchObject({ ok: true, value: { emailVerified: false } });
    }
    expect(
      await exchange(codeFor({ ...CLAIMS, email: undefined })),
    ).toMatchObject({
      ok: true,
      value: { email: null },
    });
  });

  it("refuses a verifier that is not the code's challenge's, and a nonce that is not its own", async () => {
    expect((await exchange(codeFor(), 'another-verifier')).ok).toBe(false);
    expect((await exchange(codeFor(), VERIFIER, 'another-nonce')).ok).toBe(
      false,
    );
  });

  it("refuses a stray string, a code signed with another key, another purpose's value and a malformed payload", async () => {
    expect((await exchange('stray')).ok).toBe(false);
    expect((await exchange('')).ok).toBe(false);
    const otherKey = fixtureCode(
      { claims: CLAIMS, challenge: challengeOf(VERIFIER), nonce: NONCE },
      `${SECRET}-other`,
      AT,
    );
    expect((await exchange(otherKey)).ok).toBe(false);
    const flash = seal(
      'flash',
      {
        claims: CLAIMS,
        challenge: challengeOf(VERIFIER),
        nonce: NONCE,
        at: '2026-10-18T10:00:00Z',
      },
      SECRET,
    );
    expect((await exchange(flash)).ok).toBe(false);
    expect(
      (await exchange(seal('google-fixture-code', { x: 1 }, SECRET))).ok,
    ).toBe(false);
  });

  it('refuses a code older than ten minutes, takes one of ten', async () => {
    const at = (seconds: number) =>
      unwrap(
        instantFrom(
          new Date(AT + seconds * 1000).toISOString().replace('.000Z', 'Z'),
        ),
      );
    const code = codeFor();
    const run = (now: ReturnType<typeof at>) =>
      provider(now).exchange({ code, verifier: VERIFIER, nonce: NONCE });
    expect((await run(at(600))).ok).toBe(true);
    expect((await run(at(601))).ok).toBe(false);
  });

  it('refuses a sub that is no Google id', async () => {
    expect((await exchange(codeFor({ ...CLAIMS, sub: '' }))).ok).toBe(false);
    expect((await exchange(codeFor({ ...CLAIMS, sub: 5 }))).ok).toBe(false);
  });
});
