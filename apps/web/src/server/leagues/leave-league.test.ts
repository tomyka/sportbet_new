import { ok, refuse } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeLeagueWorld,
  leaguePost,
  type LeftMessages,
} from '../../../tests/support/league-requests';
import { asLeague } from './id-field';
import { answerLeave, type LeaveWorld } from './leave-league';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');

function world(
  overrides: Partial<LeaveWorld> = {},
): LeaveWorld & LeftMessages & { readonly exits: unknown[] } {
  const exits: unknown[] = [];
  return {
    ...fakeLeagueWorld(JONAS),
    exit: (exit) => {
      exits.push(exit);
      return Promise.resolve(ok({ selected: null }));
    },
    ...overrides,
    exits,
  };
}

const post = (fields: Record<string, string>) =>
  leaguePost('/leagues/leave', fields, {
    referer: 'https://sportbet.example/leagues',
  });

describe('answerLeave (LeagueController::leaveLeague)', () => {
  it('leaves under the rule set the app runs and says so on the league page', async () => {
    const here = world();
    const answer = await answerLeave(post({ leagueID: '7' }), here);
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(here.left).toEqual(['league-left']);
    expect(here.exits).toEqual([{ actor: JONAS, league: asLeague(7) }]);
  });

  it.each([
    ['public', 'leave-public'],
    ['owner', 'leave-owner'],
    ['only-league', 'leave-only-league'],
  ] as const)(
    'says %s as an error message, back to the page the form came from',
    async (refusal, message) => {
      const here = world({ exit: () => Promise.resolve(refuse(refusal)) });
      const answer = await answerLeave(post({ leagueID: '7' }), here);
      expect(answer.status).toBe(303);
      expect(here.left).toEqual([message]);
    },
  );

  it.each(['not-a-member', 'no-such-league'] as const)(
    'answers %s with a 404 and no message',
    async (refusal) => {
      const here = world({ exit: () => Promise.resolve(refuse(refusal)) });
      const answer = await answerLeave(post({ leagueID: '7' }), here);
      expect(answer.status).toBe(404);
      expect(here.left).toEqual([]);
    },
  );

  it('answers a league id Laravel refuses with a 422 and one no league has with a 404', async () => {
    const here = world();
    const refused = await answerLeave(post({ leagueID: '' }), here);
    expect(refused.status).toBe(422);
    const missing = await answerLeave(post({ leagueID: '0' }), here);
    expect(missing.status).toBe(404);
    expect(here.exits).toEqual([]);
  });
});
