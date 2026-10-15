// Slice 15, R-94: the Euroleague feed adapters. The live one is tested with an
// injected fetchFn only; the Vitest network guard proves nothing else leaves
// this machine.

import { seasonCodeSchema, type SeasonCode } from '@sportbet/domain';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  euroleagueFeedEnvSchema,
  euroleagueFeedOf,
  fixtureEuroleagueFeed,
  liveEuroleagueFeed,
} from '../src/import/feed';

const SEASON: SeasonCode = seasonCodeSchema.parse('E2026');
const FIXTURE_PATH = fileURLToPath(
  new URL(
    '../../domain/test/fixtures/euroleague-e2026-games.json',
    import.meta.url,
  ),
);

function fetchOf(...answers: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({
      url: input instanceof Request ? input.url : input.toString(),
      init,
    });
    const next = answers.shift();
    if (next === undefined) throw new Error('fetch called too often');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { fetchFn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('liveEuroleagueFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the season games URL for JSON, with a timeout, and answers the body', async () => {
    const { fetchFn, calls } = fetchOf(json({ data: [] }));
    const answer = await liveEuroleagueFeed(fetchFn).games(SEASON);
    expect(answer).toEqual({ ok: true, value: { data: [] } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games',
    );
    expect(calls[0]?.init?.headers).toEqual({ accept: 'application/json' });
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('answers a 404 as http-error 404 without a retry', async () => {
    const { fetchFn, calls } = fetchOf(new Response('', { status: 404 }));
    const answer = await liveEuroleagueFeed(fetchFn).games(SEASON);
    expect(answer).toEqual({
      ok: false,
      refusal: { kind: 'http-error', status: 404 },
    });
    expect(calls).toHaveLength(1);
  });

  it('retries a 5xx a second apart: two 503s then a 200 is ok after 3 calls', async () => {
    const { fetchFn, calls } = fetchOf(
      new Response('', { status: 503 }),
      new Response('', { status: 503 }),
      json({ data: [1] }),
    );
    const pending = liveEuroleagueFeed(fetchFn).games(SEASON);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toEqual({ ok: true, value: { data: [1] } });
    expect(calls).toHaveLength(3);
  });

  it('gives up after three 5xx answers with the last status', async () => {
    const { fetchFn, calls } = fetchOf(
      new Response('', { status: 502 }),
      new Response('', { status: 503 }),
      new Response('', { status: 500 }),
    );
    const pending = liveEuroleagueFeed(fetchFn).games(SEASON);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toEqual({
      ok: false,
      refusal: { kind: 'http-error', status: 500 },
    });
    expect(calls).toHaveLength(3);
  });

  it('answers unreachable after three throws', async () => {
    const { fetchFn, calls } = fetchOf(
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
    );
    const pending = liveEuroleagueFeed(fetchFn).games(SEASON);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toEqual({
      ok: false,
      refusal: { kind: 'unreachable' },
    });
    expect(calls).toHaveLength(3);
  });

  it('recovers when a throw is followed by an answer', async () => {
    const { fetchFn } = fetchOf(
      new TypeError('fetch failed'),
      json({ data: [] }),
    );
    const pending = liveEuroleagueFeed(fetchFn).games(SEASON);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toEqual({ ok: true, value: { data: [] } });
  });

  it('answers an HTML body, or JSON that is not an object, as not-json', async () => {
    for (const body of ['<html>maintenance</html>', '7', 'null']) {
      const { fetchFn } = fetchOf(new Response(body));
      expect(await liveEuroleagueFeed(fetchFn).games(SEASON)).toEqual({
        ok: false,
        refusal: { kind: 'not-json' },
      });
    }
  });
});

describe('fixtureEuroleagueFeed', () => {
  it("answers sportbet's fixture whatever the season", async () => {
    const answer = await fixtureEuroleagueFeed(FIXTURE_PATH).games(SEASON);
    expect(answer.ok).toBe(true);
    expect(answer.ok && JSON.stringify(answer.value).includes('"data"')).toBe(
      true,
    );
  });

  it('answers unreachable for a missing file and not-json for a bad one', async () => {
    expect(
      await fixtureEuroleagueFeed('/no/such/file.json').games(SEASON),
    ).toEqual({ ok: false, refusal: { kind: 'unreachable' } });
    expect(
      await fixtureEuroleagueFeed(fileURLToPath(import.meta.url)).games(SEASON),
    ).toEqual({ ok: false, refusal: { kind: 'not-json' } });
  });
});

describe('euroleagueFeedEnvSchema', () => {
  const live = { EUROLEAGUE_FEED: 'live' };
  const fixture = {
    EUROLEAGUE_FEED: 'fixture',
    EUROLEAGUE_FEED_FIXTURE: FIXTURE_PATH,
  };
  const accepted = (value: Record<string, string>) =>
    euroleagueFeedEnvSchema.safeParse(value).success;

  it.each([
    ['staging', true, false],
    ['production', true, false],
    ['ci', false, true],
    ['local', true, true],
    [undefined, false, true],
  ])(
    'under SPORTBET_ENV=%s: live %s, fixture %s',
    (where, liveOk, fixtureOk) => {
      const env = where === undefined ? {} : { SPORTBET_ENV: where };
      expect(accepted({ ...env, ...live })).toBe(liveOk);
      expect(accepted({ ...env, ...fixture })).toBe(fixtureOk);
    },
  );

  it('refuses a missing, unknown or path-less setting', () => {
    expect(accepted({ SPORTBET_ENV: 'local' })).toBe(false);
    expect(accepted({ SPORTBET_ENV: 'local', EUROLEAGUE_FEED: 'maybe' })).toBe(
      false,
    );
    expect(
      accepted({ SPORTBET_ENV: 'local', EUROLEAGUE_FEED: 'fixture' }),
    ).toBe(false);
    expect(accepted({ ...live, SPORTBET_ENV: 'moon' })).toBe(false);
  });

  it('names the feed an environment may use', () => {
    const result = euroleagueFeedEnvSchema.safeParse({
      SPORTBET_ENV: 'ci',
      ...live,
    });
    expect(result.success ? '' : result.error.issues[0]?.message).toBe(
      'SPORTBET_ENV=ci reads the schedule only from the fixture feed',
    );
  });
});

describe('euroleagueFeedOf', () => {
  it('builds the fixture feed from the fixture setting', async () => {
    const feed = euroleagueFeedOf({
      EUROLEAGUE_FEED: 'fixture',
      EUROLEAGUE_FEED_FIXTURE: FIXTURE_PATH,
    });
    expect((await feed.games(SEASON)).ok).toBe(true);
  });

  it('builds the live feed over the fetch it is given', async () => {
    const { fetchFn, calls } = fetchOf(json({ data: [] }));
    const feed = euroleagueFeedOf({ EUROLEAGUE_FEED: 'live' }, fetchFn);
    expect((await feed.games(SEASON)).ok).toBe(true);
    expect(calls[0]?.url).toContain('/seasons/E2026/games');
  });
});
