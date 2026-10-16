import { createHash, timingSafeEqual } from 'node:crypto';
import { logInfo } from '../log';
import type { RunResult } from './send-reminders';

const BEARER = 'Bearer ';

const NO_STORE = { 'Cache-Control': 'no-store' };

const digestOf = (text: string): Buffer =>
  createHash('sha256').update(text).digest();

/**
 * Whether the Authorization header is `Bearer <secret>`. The two sides are
 * compared as SHA-256 digests, so the compare is constant-time whatever the
 * lengths and the secret's length is not leaked; a header that is no bearer
 * is compared as an empty token, so every request costs the same.
 */
function bearerMatches(header: string | null, secret: string): boolean {
  // An empty secret matches an empty token: never let that be a key.
  if (secret === '') return false;
  const given =
    header?.startsWith(BEARER) === true ? header.slice(BEARER.length) : '';
  return timingSafeEqual(digestOf(given), digestOf(secret));
}

/** What answering the cron route needs of the world. */
export interface CronWorld {
  /** CRON_SECRET: undefined where it is not configured. */
  readonly secret: string | undefined;
  readonly run: () => Promise<RunResult>;
}

/**
 * POST /api/cron/reminders (R-97): no session, no cookie - the bearer
 * secret is the only authority. Not configured: 503 and nothing runs (not
 * even for an empty bearer); an empty secret matches nothing. A missing or wrong header: 401, no body. A
 * good one: the run's counts, 200; a failed run: 500 and no body. Nothing
 * is logged but counts and an error's name: never the secret, the header, an
 * address or an error's message.
 */
export async function answerCron(
  request: Request,
  world: CronWorld,
): Promise<Response> {
  if (world.secret === undefined) return new Response(null, { status: 503 });
  if (!bearerMatches(request.headers.get('authorization'), world.secret)) {
    return new Response(null, { status: 401 });
  }
  try {
    const result = await world.run();
    logInfo('reminders', { ...result });
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    const kind = error instanceof Error ? error.name : 'unknown';
    console.error(`reminders: the run failed (${kind})`);
    return new Response(null, { status: 500 });
  }
}
