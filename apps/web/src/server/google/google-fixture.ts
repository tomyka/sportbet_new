import {
  googleIdentity,
  ok,
  refuse,
  instantFrom,
  type GoogleIdentity,
  type Instant,
  type Result,
} from '@sportbet/domain';
import { z } from 'zod';
import { isoSecond } from '../clock';
import { seal, unseal } from '../sealed';
import { challengeOf } from './pkce';
import type {
  AuthorizationRequest,
  CodeExchange,
  OAuthProvider,
} from './provider';

// The fixture Google (spec decision 2): the one the tests and CI's E2E sign
// in with. Not for people - env refuses it where SPORTBET_ENV is staging or
// production - so nothing here is Lithuanian text.

/** Where its "consent page" is. */
export const FIXTURE_PATH = '/auth/google/fixture';

/** What the seal is for: a code is a fixture's alone, never a flash or a cookie. */
const PURPOSE = 'google-fixture-code';

/** How long a code lives, as a real one's (ten minutes). */
const CODE_SECONDS = 600;

/**
 * The claims a fixture code stands for, as Google's would parse
 * (`unknown`s: a test sends a string "true", a number or nothing, to prove
 * the domain refuses it).
 */
export interface FixtureClaims {
  readonly sub: unknown;
  readonly email: unknown;
  readonly emailVerified: unknown;
  readonly name: unknown;
}

const codeSchema = z.object({
  claims: z.object({
    sub: z.unknown().optional(),
    email: z.unknown().optional(),
    emailVerified: z.unknown().optional(),
    name: z.unknown().optional(),
  }),
  challenge: z.string(),
  nonce: z.string(),
  at: z.string(),
});

/**
 * A code for the identity, bound to the trip's challenge and nonce, signed
 * under AUTH_SECRET: a stray string, or a code of another trip, is refused
 * by `exchange`. The consent page makes these; so do the tests.
 */
export function fixtureCode(
  input: {
    readonly claims: FixtureClaims;
    readonly challenge: string;
    readonly nonce: string;
  },
  secret: string,
  now: Instant,
): string {
  return seal(PURPOSE, { ...input, at: isoSecond(now) }, secret);
}

/** The fixture provider: its authorization URL is its own consent page, its codes sealed identities. */
export function fixtureGoogleProvider(world: {
  readonly secret: string;
  readonly now: () => Instant;
}): OAuthProvider {
  return {
    authorizationUrl: ({ state, nonce, challenge }: AuthorizationRequest) =>
      `${FIXTURE_PATH}?${new URLSearchParams({ state, nonce, challenge }).toString()}`,
    exchange: ({
      code,
      verifier,
      nonce,
    }: CodeExchange): Promise<Result<GoogleIdentity, 'failed'>> =>
      Promise.resolve(
        exchangeFixture({ code, verifier, nonce }, world.secret, world.now()),
      ),
  };
}

function exchangeFixture(
  { code, verifier, nonce }: CodeExchange,
  secret: string,
  now: Instant,
): Result<GoogleIdentity, 'failed'> {
  const parsed = codeSchema.safeParse(unseal(PURPOSE, code, secret));
  if (!parsed.success) return refuse('failed');
  const issued = instantFrom(parsed.data.at);
  if (!issued.ok || now - issued.value > CODE_SECONDS * 1000) {
    return refuse('failed');
  }
  if (
    parsed.data.challenge !== challengeOf(verifier) ||
    parsed.data.nonce !== nonce
  ) {
    return refuse('failed');
  }
  const { sub, email, emailVerified, name } = parsed.data.claims;
  const identity = googleIdentity({ sub, email, emailVerified, name });
  return identity.ok ? ok(identity.value) : refuse('failed');
}
