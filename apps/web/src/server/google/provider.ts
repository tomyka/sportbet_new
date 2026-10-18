import type { GoogleIdentity, Instant, Result } from '@sportbet/domain';

/** The part of fetch the live provider uses, so tests stand in for it. */
export type GoogleFetch = (url: string, init: RequestInit) => Promise<Response>;

/** What the browser is sent to Google with: the three values this trip is bound to. */
export interface AuthorizationRequest {
  readonly state: string;
  readonly nonce: string;
  /** The PKCE S256 challenge of the verifier the cookie holds. */
  readonly challenge: string;
}

/** What the callback hands the back channel: the code, and what this browser's trip was bound to. */
export interface CodeExchange {
  readonly code: string;
  readonly verifier: string;
  readonly nonce: string;
}

/**
 * Where a person's Google identity comes from (spec decision 2): the real
 * Google, or the fixture the tests and CI's E2E use. The authorization code
 * flow with PKCE, `state` and `nonce`; the domain only ever sees the
 * identity, never a token.
 */
export interface OAuthProvider {
  /** Where to send the browser to sign in: an absolute address (live) or a path on this site (fixture). */
  authorizationUrl(request: AuthorizationRequest): string;
  /** The identity the code stands for, or `failed` for any reason at all (the reason is logged by kind, never shown). */
  exchange(exchange: CodeExchange): Promise<Result<GoogleIdentity, 'failed'>>;
}

/** What a provider needs of the world, so tests stand in for each. */
export interface ProviderWorld {
  readonly fetch: GoogleFetch;
  /** AUTH_SECRET: the fixture signs its codes with it. */
  readonly secret: string;
  readonly now: () => Instant;
}
