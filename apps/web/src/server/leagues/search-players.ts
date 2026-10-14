import type { FoundPlayer } from '@sportbet/db';
import {
  leagueSearchLimits,
  type Instant,
  type LeagueId,
  type PlayerId,
  type Result,
  type RuleSet,
  type ThrottleLimit,
} from '@sportbet/domain';
import { trimInput } from '../request/form-input';
import { validationBody } from '../request/laravel-answers';
import { notFound } from '../request/route-responses';
import { throttledAnswer } from '../request/save-answers';
import type { ThrottleVerdict } from '../sign-in/throttle';
import { asLeague, readIdField } from './id-field';

export interface SearchWorld {
  readonly signedIn: () => Promise<{ readonly player: PlayerId } | null>;
  readonly rules: RuleSet;
  readonly now: () => Instant;
  readonly throttle: (
    limits: readonly ThrottleLimit[],
    now: Instant,
  ) => Promise<ThrottleVerdict>;
  readonly isAdmin: (check: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
  }) => Promise<boolean>;
  readonly search: (search: {
    readonly league: LeagueId;
    readonly actor: PlayerId;
    readonly query: string;
    readonly rules: RuleSet;
  }) => Promise<Result<readonly FoundPlayer[], 'not-an-admin'>>;
}

const QUERY_NOT_A_STRING = 'The query field must be a string.';

/** `query=` as a string (PHP keeps the last of a repeated one); `query[]=` makes it an array, which `nullable|string` refuses. */
function queryOf(params: URLSearchParams): string | null {
  const isArray = [...params.keys()].some((key) => key.startsWith('query['));
  if (isArray) return null;
  return trimInput(params.getAll('query').at(-1) ?? '');
}

const json = (body: unknown, status: number): Response =>
  Response.json(body, { status });

/**
 * LeagueController::searchUsers (a GET answering JSON): a guest gets the
 * `auth` answer to a JSON request, 401; the search is limited per account
 * (`leagueSearchLimits`, checked before anything is read: 429); then
 * `leagueID` (422, or 404 for an integer no league has), the admin gate (a
 * league the player does not administer is a 404, before the query is looked
 * at), then `query` (an array: 422); the answer is the found players,
 * `[{id, username, name, surname}]` and nothing else.
 */
export async function answerSearch(
  request: Request,
  world: SearchWorld,
): Promise<Response> {
  const signedIn = await world.signedIn();
  if (signedIn === null) return json({ message: 'Unauthenticated.' }, 401);
  const verdict = await world.throttle(
    leagueSearchLimits(signedIn.player),
    world.now(),
  );
  if (!verdict.allowed) {
    const answer = throttledAnswer(verdict.minutes);
    return json(answer.body, answer.status);
  }
  const params = new URL(request.url).searchParams;
  const league = readIdField(params.get('leagueID'), 'leagueID');
  if (league.kind === 'refused') {
    return json(
      validationBody([{ field: league.field, message: league.message }]),
      422,
    );
  }
  if (league.kind === 'no-such-row') return notFound();
  const leagueId = asLeague(league.id);
  if (!(await world.isAdmin({ actor: signedIn.player, league: leagueId }))) {
    return notFound();
  }
  const query = queryOf(params);
  if (query === null) {
    return json(
      validationBody([{ field: 'query', message: QUERY_NOT_A_STRING }]),
      422,
    );
  }
  const found = await world.search({
    league: leagueId,
    actor: signedIn.player,
    query,
    rules: world.rules,
  });
  return found.ok ? json(found.value, 200) : notFound();
}
