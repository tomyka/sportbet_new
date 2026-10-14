import type { FoundPlayer } from '@sportbet/db';
import { ok, refuse, ruledRules, type ThrottleLimit } from '@sportbet/domain';
import { at, player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { asLeague } from './id-field';
import { answerSearch, type SearchWorld } from './search-players';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');
const NOW = at('2026-10-15T10:00:00Z');
const SARUNAS: FoundPlayer = {
  id: player('4'),
  username: 'sarunas',
  name: 'Šarūnas',
  surname: 'Jasikevičius',
};

function world(overrides: Partial<SearchWorld> = {}): SearchWorld & {
  readonly searched: unknown[];
  readonly limited: (readonly ThrottleLimit[])[];
} {
  const searched: unknown[] = [];
  const limited: (readonly ThrottleLimit[])[] = [];
  return {
    signedIn: () => Promise.resolve({ player: JONAS }),
    rules: ruledRules,
    isAdmin: () => Promise.resolve(true),
    now: () => NOW,
    throttle: (limits) => {
      limited.push(limits);
      return Promise.resolve({ allowed: true });
    },
    search: (search) => {
      searched.push(search);
      return Promise.resolve(ok([SARUNAS]));
    },
    ...overrides,
    searched,
    limited,
  };
}

const get = (query: string): Request =>
  new Request(`https://sportbet.example/leagues/searchUsers?${query}`);

describe('answerSearch (LeagueController::searchUsers)', () => {
  it('answers the found players as JSON, searched under the ruled rules with the query trimmed', async () => {
    const here = world();
    const answer = await answerSearch(get('leagueID=7&query=%20saru%20'), here);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual([
      {
        id: '4',
        username: 'sarunas',
        name: 'Šarūnas',
        surname: 'Jasikevičius',
      },
    ]);
    expect(here.searched).toEqual([
      { league: asLeague(7), actor: JONAS, query: 'saru', rules: ruledRules },
    ]);
  });

  it('answers a guest with 401 and searches nothing', async () => {
    const here = world({ signedIn: () => Promise.resolve(null) });
    const answer = await answerSearch(get('leagueID=7&query=saru'), here);
    expect(answer.status).toBe(401);
    expect(await answer.json()).toEqual({ message: 'Unauthenticated.' });
    expect(here.searched).toEqual([]);
  });

  it("limits the player's searches first: 429 with the throttle text, nothing read", async () => {
    const here = world({
      throttle: () => Promise.resolve({ allowed: false, minutes: 1 }),
    });
    const answer = await answerSearch(get('leagueID=bad&query=saru'), here);
    expect(answer.status).toBe(429);
    expect(await answer.json()).toEqual({
      success: false,
      message: 'Per daug bandymų. Pabandykite dar kartą po 1 min.',
    });
    expect(here.searched).toEqual([]);
  });

  it("counts the search against the player's own limit", async () => {
    const here = world();
    await answerSearch(get('leagueID=7&query=saru'), here);
    expect(here.limited).toEqual([
      [
        {
          key: 'league-search:player:1',
          maxAttempts: 30,
          windowSeconds: 60,
        },
      ],
    ]);
  });

  it.each([
    ['query=saru', 'The league i d field is required.', 'leagueID'],
    [
      'leagueID=abc&query=saru',
      'The league i d field must be an integer.',
      'leagueID',
    ],
    ['leagueID=7&query[]=a', 'The query field must be a string.', 'query'],
    ['leagueID=7&query[x]=a', 'The query field must be a string.', 'query'],
  ])("answers %s with Laravel's 422", async (query, message, field) => {
    const here = world();
    const answer = await answerSearch(get(query), here);
    expect(answer.status).toBe(422);
    expect(await answer.json()).toEqual({
      message,
      errors: { [field]: [message] },
    });
    expect(here.searched).toEqual([]);
  });

  it('answers a non-admin with a 404 before the query is looked at, an admin with the 422', async () => {
    const refused = await answerSearch(
      get('leagueID=7&query[]=a'),
      world({ isAdmin: () => Promise.resolve(false) }),
    );
    expect(refused.status).toBe(404);
    const admin = await answerSearch(get('leagueID=7&query[]=a'), world());
    expect(admin.status).toBe(422);
  });

  it('answers a league id no league has with a 404', async () => {
    const answer = await answerSearch(get('leagueID=0&query=saru'), world());
    expect(answer.status).toBe(404);
  });

  it('answers a league the player does not administer with a 404', async () => {
    const answer = await answerSearch(
      get('leagueID=7&query=saru'),
      world({ search: () => Promise.resolve(refuse('not-an-admin')) }),
    );
    expect(answer.status).toBe(404);
  });

  it('reads a missing query as empty, and the last of a repeated one', async () => {
    const here = world();
    await answerSearch(get('leagueID=7'), here);
    await answerSearch(get('leagueID=7&query=a&query=bc'), here);
    expect(here.searched).toMatchObject([{ query: '' }, { query: 'bc' }]);
  });
});
