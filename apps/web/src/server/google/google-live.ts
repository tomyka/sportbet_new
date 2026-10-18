import {
  googleIdentity,
  ok,
  refuse,
  type GoogleIdentity,
  type Instant,
  type Result,
} from '@sportbet/domain';
import { z } from 'zod';
import type { GoogleEnv } from '../../google-env';
import type {
  AuthorizationRequest,
  CodeExchange,
  OAuthProvider,
  ProviderWorld,
} from './provider';

// The real Google: the only code in this app that names its hosts (a test
// reads every source file to prove it). The authorization code flow with
// PKCE, `state` and `nonce`, written with `fetch`; the id_token is taken from
// the back channel's own response, over TLS, authenticated by the client
// secret and the PKCE verifier (OpenID Connect Core 3.1.3.7), so its
// signature is not checked and each claim is (spec decision 1).

export const GOOGLE_AUTHORIZATION_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** The issuer, in the two spellings Google's id_tokens use. */
export const GOOGLE_ISSUER = 'https://accounts.google.com';
const ISSUERS: readonly string[] = [
  GOOGLE_ISSUER,
  GOOGLE_ISSUER.replace('https://', ''),
];

/** The scopes sportbet's Socialite asks for by default. */
const SCOPE = 'openid email profile';

/** The back channel is bounded (spec decision 18): no redirect, ten seconds, 64 KB. */
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ID_TOKEN_CHARACTERS = 8 * 1024;

/** `iat` may be this far in the future by our clock, for skew. */
const CLOCK_SKEW_SECONDS = 60;

/** What an id_token's claims are judged against. */
export interface ExpectedClaims {
  readonly clientId: string;
  /** The nonce this browser's trip was given. */
  readonly nonce: string;
  readonly now: Instant;
}

const claimsSchema = z.record(z.string(), z.unknown());

const audienceMatches = (
  claims: Record<string, unknown>,
  clientId: string,
): boolean => {
  const { aud, azp } = claims;
  if (aud === clientId) return azp === undefined || azp === clientId;
  return (
    Array.isArray(aud) &&
    aud.length === 1 &&
    aud[0] === clientId &&
    azp === clientId
  );
};

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** `exp` is in the future and `iat` is not, by more than the skew, by our clock. */
function timesAreRight(claims: Record<string, unknown>, now: Instant): boolean {
  const { exp, iat } = claims;
  const seconds = now / 1000;
  return (
    isNumber(exp) &&
    isNumber(iat) &&
    exp > seconds &&
    iat <= seconds + CLOCK_SKEW_SECONDS
  );
}

/**
 * The identity the claims stand for, or `failed`: the issuer is Google's, the
 * audience is this client (a list holding only it, with `azp` it), the token
 * has not expired and was not issued in the future, and its nonce is this
 * browser's. `sub` and the address are the domain's to judge
 * (`googleIdentity`: only the JSON boolean `true` verifies). Pure.
 */
export function identityFromIdToken(
  payload: unknown,
  expected: ExpectedClaims,
): Result<GoogleIdentity, 'failed'> {
  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) return refuse('failed');
  const claims = parsed.data;
  const valid =
    typeof claims['iss'] === 'string' &&
    ISSUERS.includes(claims['iss']) &&
    audienceMatches(claims, expected.clientId) &&
    timesAreRight(claims, expected.now) &&
    typeof claims['nonce'] === 'string' &&
    claims['nonce'] === expected.nonce;
  if (!valid) return refuse('failed');
  const identity = googleIdentity({
    sub: claims['sub'],
    email: claims['email'],
    emailVerified: claims['email_verified'],
    name: claims['name'],
  });
  return identity.ok ? ok(identity.value) : refuse('failed');
}

const SEGMENT = /^[A-Za-z0-9_-]+$/;

/** The payload of a three-segment id_token whose segments are base64url, or null. */
export function payloadOfIdToken(token: string): unknown {
  const segments = token.split('.');
  const [, body] = segments;
  if (
    segments.length !== 3 ||
    body === undefined ||
    !segments.every((segment) => SEGMENT.test(segment))
  ) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    );
    return parsed;
  } catch {
    return null;
  }
}

const tokenResponseSchema = z.object({
  id_token: z.string().min(1).max(MAX_ID_TOKEN_CHARACTERS),
});

/** The body as text, or null once it passes `max` bytes (the rest is never read). */
async function readCapped(
  response: Response,
  max: number,
): Promise<string | null> {
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** What the token endpoint is asked: the code, the verifier, the redirect URI, and the secret - in the body, never the URL. */
function tokenRequest(
  env: Extract<GoogleEnv, { provider: 'live' }>,
  exchange: CodeExchange,
  timeoutMs: number,
): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: exchange.code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: exchange.verifier,
    }).toString(),
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  };
}

/** The id_token's payload from the back channel's answer, or null for anything but a good, small, 200 one. */
async function idTokenPayload(response: Response): Promise<unknown> {
  if (response.status !== 200) return null;
  const text = await readCapped(response, MAX_BODY_BYTES);
  if (text === null) return null;
  try {
    const body = tokenResponseSchema.safeParse(JSON.parse(text));
    return body.success ? payloadOfIdToken(body.data.id_token) : null;
  } catch {
    return null;
  }
}

/**
 * The real Google. `exchange` makes the one back-channel request and judges
 * the claims; every failure - a refused request, a timeout, a redirect, an
 * oversized or malformed answer, a claim - is `failed`. Nothing here is
 * logged: the caller logs the outcome kind only.
 */
export function liveGoogleProvider(
  env: Extract<GoogleEnv, { provider: 'live' }>,
  world: ProviderWorld & { readonly timeoutMs?: number },
): OAuthProvider {
  const timeoutMs = world.timeoutMs ?? TIMEOUT_MS;
  return {
    authorizationUrl: ({ state, nonce, challenge }: AuthorizationRequest) =>
      `${GOOGLE_AUTHORIZATION_ENDPOINT}?${new URLSearchParams({
        response_type: 'code',
        client_id: env.clientId,
        redirect_uri: env.redirectUri,
        scope: SCOPE,
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString()}`,
    exchange: async (exchange) => {
      try {
        const response = await world.fetch(
          GOOGLE_TOKEN_ENDPOINT,
          tokenRequest(env, exchange, timeoutMs),
        );
        const payload = await idTokenPayload(response);
        return identityFromIdToken(payload, {
          clientId: env.clientId,
          nonce: exchange.nonce,
          now: world.now(),
        });
      } catch {
        return refuse('failed');
      }
    },
  };
}
