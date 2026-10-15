import {
  ok,
  refuseWith,
  type DetailedResult,
  type EuroleagueFeed,
  type FeedFailure,
  type SeasonCode,
} from '@sportbet/domain';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

// The one file in the repo that names the Euroleague host, in production and
// test code alike (the lint ban on the `fetch` global elsewhere and the Vitest
// network guard are wired by the owner's gate-config edits).
const SEASONS = 'https://api-live.euroleague.net/v2/competitions/E/seasons';

/** The URL of one season's games: the one place the host is named, for tests too. */
export function seasonUrl(season: SeasonCode): string {
  return `${SEASONS}/${encodeURIComponent(season)}/games`;
}

// Three attempts of 15 s and two pauses are 47 s at the worst, inside the
// save route's `maxDuration = 60`.
const ATTEMPTS = 3;
const ATTEMPT_PAUSE_MS = 1_000;
const TIMEOUT_MS = 15_000;

/** The most a season's answer may weigh: 380 games are about 400 KB. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

type Answer = DetailedResult<unknown, FeedFailure>;

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const bytes = z.instanceof(Uint8Array);

/** The body's text, read at most `MAX_BODY_BYTES` deep; null when it is longer. */
async function boundedText(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_BODY_BYTES) return null;
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const read = await reader.read();
    if (read.done) return text + decoder.decode();
    const value = bytes.parse(read.value);
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/** The decoded body of an answer: an object or an array, else not JSON (or too long to read). */
async function bodyOf(response: Response): Promise<Answer> {
  try {
    const text = await boundedText(response);
    if (text === null) return refuseWith({ kind: 'not-json' });
    const body: unknown = JSON.parse(text);
    return typeof body === 'object' && body !== null
      ? ok(body)
      : refuseWith({ kind: 'not-json' });
  } catch {
    return refuseWith({ kind: 'not-json' });
  }
}

/** True when the answer came from another host than the feed's (a redirect followed on the way). */
function fromAnotherHost(response: Response, url: string): boolean {
  return (
    response.url !== '' && new URL(response.url).host !== new URL(url).host
  );
}

/**
 * One attempt: `retry` when a thrown error or a 5xx says another may do
 * better. A redirect is never followed: any 3xx is an http-error.
 */
async function attempt(
  fetchFn: typeof fetch,
  url: string,
): Promise<{ readonly answer: Answer; readonly retry: boolean }> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { answer: refuseWith({ kind: 'unreachable' }), retry: true };
  }
  if (!response.ok) {
    return {
      answer: refuseWith({ kind: 'http-error', status: response.status }),
      retry: response.status >= 500,
    };
  }
  if (fromAnotherHost(response, url)) {
    return { answer: refuseWith({ kind: 'unreachable' }), retry: false };
  }
  return { answer: await bodyOf(response), retry: false };
}

/**
 * sportbet's feed (EuroleagueFeed::games): one unauthenticated GET per
 * season, three attempts a second apart on a thrown error or a 5xx; anything
 * else is final. Unlike sportbet's, a redirect is refused, the answer is read
 * at most 5 MB deep and each attempt waits 15 s, not 60. `fetchFn` is
 * injected: tests pass a fake.
 */
export function liveEuroleagueFeed(fetchFn: typeof fetch): EuroleagueFeed {
  return {
    async games(season: SeasonCode): Promise<Answer> {
      const url = seasonUrl(season);
      let last = await attempt(fetchFn, url);
      for (let tried = 1; last.retry && tried < ATTEMPTS; tried += 1) {
        await pause(ATTEMPT_PAUSE_MS);
        last = await attempt(fetchFn, url);
      }
      return last.answer;
    },
  };
}

/** A feed that answers the same file whatever the season: for CI, local runs and tests. */
export function fixtureEuroleagueFeed(path: string): EuroleagueFeed {
  return {
    async games(): Promise<Answer> {
      let text: string;
      try {
        text = await readFile(path, 'utf8');
      } catch {
        return refuseWith({ kind: 'unreachable' });
      }
      try {
        return ok(JSON.parse(text));
      } catch {
        return refuseWith({ kind: 'not-json' });
      }
    },
  };
}

/** Where the server runs; unset is a developer's machine (as the web env's). */
const sportbetEnvSchema = z.enum(['local', 'ci', 'staging', 'production']);

const feedSchema = z.discriminatedUnion('EUROLEAGUE_FEED', [
  z.object({ EUROLEAGUE_FEED: z.literal('live') }),
  z.object({
    EUROLEAGUE_FEED: z.literal('fixture'),
    EUROLEAGUE_FEED_FIXTURE: z.string().min(1),
  }),
]);

/**
 * Which feed runs, held to `SPORTBET_ENV` like the mail transport: staging
 * and production only `live`; ci and an unset environment only `fixture`;
 * local either. A bad setting stops the process at start.
 */
export const euroleagueFeedEnvSchema = z
  .object({ SPORTBET_ENV: sportbetEnvSchema.optional() })
  .and(feedSchema)
  .superRefine((value, context) => {
    const where = value.SPORTBET_ENV;
    const deployed = where === 'staging' || where === 'production';
    const allowed = where === 'local' ? null : deployed ? 'live' : 'fixture';
    if (allowed !== null && value.EUROLEAGUE_FEED !== allowed) {
      context.addIssue({
        code: 'custom',
        path: ['EUROLEAGUE_FEED'],
        message: `SPORTBET_ENV=${where ?? 'unset'} reads the schedule only from the ${allowed} feed`,
      });
    }
  });

export type EuroleagueFeedEnv = z.infer<typeof euroleagueFeedEnvSchema>;

/** The feed the environment chose; `fetchFn` is the global `fetch` unless a caller injects one. */
export function euroleagueFeedOf(
  env: EuroleagueFeedEnv,
  fetchFn: typeof fetch = fetch,
): EuroleagueFeed {
  return env.EUROLEAGUE_FEED === 'live'
    ? liveEuroleagueFeed(fetchFn)
    : fixtureEuroleagueFeed(env.EUROLEAGUE_FEED_FIXTURE);
}
