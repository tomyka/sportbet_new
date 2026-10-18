import { instantFrom } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { challengeOf } from './pkce';
import type { OAuthProvider } from './provider';
import { startGoogle, type StartWorld } from './start';

const AT = unwrap(instantFrom('2026-10-18T10:00:00Z'));
const REQUEST = { ip: '203.0.113.9', at: AT };

const PROVIDER: OAuthProvider = {
  authorizationUrl: ({ state, nonce, challenge }) =>
    `https://provider.test/auth?state=${state}&nonce=${nonce}&challenge=${challenge}`,
  exchange: () => Promise.reject(new Error('not used')),
};

function fakeWorld(
  setup: {
    signedIn?: boolean;
    provider?: OAuthProvider | null;
    allowed?: boolean;
  } = {},
) {
  const done: string[] = [];
  const trips: { state: string; nonce: string; verifier: string }[] = [];
  const logged: string[] = [];
  const world: StartWorld = {
    signedIn: () => Promise.resolve(setup.signedIn ?? false),
    provider: () => {
      done.push('provider');
      return setup.provider === undefined ? PROVIDER : setup.provider;
    },
    throttle: (limits) => {
      done.push(`throttle ${limits[0]?.key ?? ''}`);
      return Promise.resolve(
        setup.allowed === false
          ? { allowed: false, minutes: 2 }
          : { allowed: true },
      );
    },
    mintTrip: (trip) => {
      trips.push(trip);
    },
    log: (outcome) => {
      logged.push(outcome);
    },
  };
  return { world, done, trips, logged };
}

const FAILURE = { to: '/', flash: { kind: 'google-failed' } };

describe('startGoogle (GoogleAuthController::redirectToGoogle)', () => {
  it('sends a signed-in visitor home before anything is minted or asked', async () => {
    const run = fakeWorld({ signedIn: true });
    expect(await startGoogle(run.world, REQUEST)).toEqual({
      to: '/main',
      flash: null,
    });
    expect(run.done).toEqual([]);
    expect(run.trips).toEqual([]);
  });

  it('is the failure message when Google is not configured, minting nothing', async () => {
    const run = fakeWorld({ provider: null });
    expect(await startGoogle(run.world, REQUEST)).toEqual(FAILURE);
    expect(run.trips).toEqual([]);
    expect(run.logged).toEqual(['refused-not-configured']);
  });

  it('is the failure message past 20 starts in ten minutes per address, minting nothing', async () => {
    const run = fakeWorld({ allowed: false });
    expect(await startGoogle(run.world, REQUEST)).toEqual(FAILURE);
    expect(run.done).toContain('throttle google-start:ip:203.0.113.9');
    expect(run.trips).toEqual([]);
    expect(run.logged).toEqual(['refused-throttled']);
  });

  it("mints a trip and sends the browser to the provider with the trip's state, nonce and the verifier's challenge only", async () => {
    const run = fakeWorld();
    const answer = await startGoogle(run.world, REQUEST);
    const [trip] = run.trips;
    expect(trip).toBeDefined();
    expect(answer.flash).toBeNull();
    const url = new URL(answer.to);
    expect(url.searchParams.get('state')).toBe(trip?.state);
    expect(url.searchParams.get('nonce')).toBe(trip?.nonce);
    expect(url.searchParams.get('challenge')).toBe(
      challengeOf(trip?.verifier ?? ''),
    );
    expect(answer.to).not.toContain(trip?.verifier ?? 'x');
    expect(run.logged).toEqual(['started']);
  });

  it('mints a new trip every time', async () => {
    const run = fakeWorld();
    await startGoogle(run.world, REQUEST);
    await startGoogle(run.world, REQUEST);
    expect(run.trips[0]?.state).not.toBe(run.trips[1]?.state);
    expect(run.trips[0]?.verifier).not.toBe(run.trips[1]?.verifier);
  });
});
