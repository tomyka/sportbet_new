import { ok, refuse } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeLeagueWorld,
  leaguePost,
  type LeftMessages,
} from '../../../tests/support/league-requests';
import { asLeague } from './id-field';
import { answerUpdate, type UpdateWorld } from './update-league';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');

function world(
  overrides: Partial<UpdateWorld> = {},
): UpdateWorld & LeftMessages & { readonly edited: unknown[] } {
  const edited: unknown[] = [];
  return {
    ...fakeLeagueWorld(JONAS),
    isAdmin: () => Promise.resolve(true),
    edit: (edit) => {
      edited.push(edit);
      return Promise.resolve(ok(undefined));
    },
    ...overrides,
    edited,
  };
}

describe('answerUpdate (LeagueController::update)', () => {
  it('edits the league and says so on the league page; the reward is ignored', async () => {
    const here = world();
    const answer = await answerUpdate(
      leaguePost('/leagues/update', {
        leagueID: '7',
        name: 'Nauja',
        description: 'Aprašas',
        reward_description: 'ignored',
      }),
      here,
    );
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(here.left).toEqual(['league-updated']);
    expect(here.edited).toEqual([
      {
        player: JONAS,
        league: asLeague(7),
        entry: {
          name: 'Nauja',
          description: 'Aprašas',
          baseFee: null,
          penaltyStep: null,
          reward: null,
        },
      },
    ]);
  });

  it.each([
    ['', 'The league i d field is required.'],
    ['x', 'The league i d field must be an integer.'],
  ])("answers the league id %j with Laravel's 422", async (typed, message) => {
    const here = world();
    const answer = await answerUpdate(
      leaguePost('/leagues/update', { leagueID: typed, name: 'A' }),
      here,
    );
    expect(answer.status).toBe(422);
    expect(await answer.json()).toEqual({
      message,
      errors: { leagueID: [message] },
    });
    expect(here.edited).toEqual([]);
  });

  it('answers a league id no league has with a 404', async () => {
    const answer = await answerUpdate(
      leaguePost('/leagues/update', { leagueID: '0', name: 'A' }),
      world(),
    );
    expect(answer.status).toBe(404);
  });

  it('answers a non-admin with a 404 before the form is looked at, even a refused one', async () => {
    const here = world({ isAdmin: () => Promise.resolve(false) });
    const answer = await answerUpdate(
      leaguePost('/leagues/update', { leagueID: '7', name: '' }),
      here,
    );
    expect(answer.status).toBe(404);
    expect(here.edited).toEqual([]);
  });

  it('lists every refused field as a 422 and edits nothing', async () => {
    const here = world();
    const answer = await answerUpdate(
      leaguePost('/leagues/update', { leagueID: '7', name: '' }),
      here,
    );
    expect(answer.status).toBe(422);
    expect(here.edited).toEqual([]);
  });

  it.each(['not-an-admin', 'no-such-league'] as const)(
    'answers %s with a 404 and no message',
    async (refusal) => {
      const here = world({ edit: () => Promise.resolve(refuse(refusal)) });
      const answer = await answerUpdate(
        leaguePost('/leagues/update', { leagueID: '7', name: 'A' }),
        here,
      );
      expect(answer.status).toBe(404);
      expect(here.left).toEqual([]);
    },
  );
});
