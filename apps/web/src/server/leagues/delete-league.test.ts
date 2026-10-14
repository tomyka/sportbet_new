import { ok, refuse } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeLeagueWorld,
  leaguePost,
  type LeftMessages,
} from '../../../tests/support/league-requests';
import { answerDelete, type DeleteWorld } from './delete-league';
import { asLeague } from './id-field';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');

function world(
  overrides: Partial<DeleteWorld> = {},
): DeleteWorld & LeftMessages & { readonly removed: unknown[] } {
  const removed: unknown[] = [];
  return {
    ...fakeLeagueWorld(JONAS),
    remove: (remove) => {
      removed.push(remove);
      return Promise.resolve(ok(undefined));
    },
    ...overrides,
    removed,
  };
}

describe('answerDelete (LeagueController::deleteLeague)', () => {
  it("deletes the owner's league and says so on the league page", async () => {
    const here = world();
    const answer = await answerDelete(
      leaguePost('/leagues/delete', { leagueID: '7' }),
      here,
    );
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(here.left).toEqual(['league-deleted']);
    expect(here.removed).toEqual([{ actor: JONAS, league: asLeague(7) }]);
  });

  it('answers a player who is not the owner with a 403 and no message', async () => {
    const here = world({ remove: () => Promise.resolve(refuse('not-owner')) });
    const answer = await answerDelete(
      leaguePost('/leagues/delete', { leagueID: '7' }),
      here,
    );
    expect(answer.status).toBe(403);
    expect(here.left).toEqual([]);
  });

  it('answers a league that is not there with a 404', async () => {
    const answer = await answerDelete(
      leaguePost('/leagues/delete', { leagueID: '7' }),
      world({ remove: () => Promise.resolve(refuse('no-such-league')) }),
    );
    expect(answer.status).toBe(404);
  });

  it('answers a league id Laravel refuses with a 422 and one no league has with a 404', async () => {
    const here = world();
    const refused = await answerDelete(
      leaguePost('/leagues/delete', { leagueID: '1.5' }),
      here,
    );
    expect(refused.status).toBe(422);
    const missing = await answerDelete(
      leaguePost('/leagues/delete', { leagueID: '2147483648' }),
      here,
    );
    expect(missing.status).toBe(404);
    expect(here.removed).toEqual([]);
  });
});
