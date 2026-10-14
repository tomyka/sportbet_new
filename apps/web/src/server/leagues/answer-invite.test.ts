import { ok, refuse } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeLeagueWorld,
  leaguePost,
  type LeftMessages,
} from '../../../tests/support/league-requests';
import {
  answerAccept,
  answerDecline,
  type AcceptWorld,
  type DeclineWorld,
} from './answer-invite';
import { asLeague } from './id-field';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');

function accepting(
  overrides: Partial<AcceptWorld> = {},
): AcceptWorld & LeftMessages & { readonly joined: unknown[] } {
  const joined: unknown[] = [];
  return {
    ...fakeLeagueWorld(JONAS),
    join: (join) => {
      joined.push(join);
      return Promise.resolve(ok({ league: asLeague(7) }));
    },
    ...overrides,
    joined,
  };
}

function declining(
  overrides: Partial<DeclineWorld> = {},
): DeclineWorld & LeftMessages & { readonly dropped: unknown[] } {
  const dropped: unknown[] = [];
  return {
    ...fakeLeagueWorld(JONAS),
    drop: (drop) => {
      dropped.push(drop);
      return Promise.resolve(ok(undefined));
    },
    ...overrides,
    dropped,
  };
}

describe('answerAccept (LeagueController::acceptInvite)', () => {
  it('joins and says so on the league page', async () => {
    const here = accepting();
    const answer = await answerAccept(
      leaguePost('/leagues/accept', { inviteID: '3' }),
      here,
    );
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(here.left).toEqual(['league-joined']);
    expect(here.joined).toEqual([{ actor: JONAS, invite: 3 }]);
  });

  it('tells a player outside the tournament to join it first (R-20); the invite stays', async () => {
    const here = accepting({
      join: () => Promise.resolve(refuse('not-in-tournament')),
    });
    const answer = await answerAccept(
      leaguePost('/leagues/accept', { inviteID: '3' }),
      here,
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(here.left).toEqual(['join-tournament-first']);
  });

  it("answers another player's invite with a 404", async () => {
    const here = accepting({
      join: () => Promise.resolve(refuse('not-your-invite')),
    });
    const answer = await answerAccept(
      leaguePost('/leagues/accept', { inviteID: '3' }),
      here,
    );
    expect(answer.status).toBe(404);
    expect(here.left).toEqual([]);
  });

  it('answers an invite id Laravel refuses with a 422 and one no invite has with a 404', async () => {
    const here = accepting();
    const refused = await answerAccept(
      leaguePost('/leagues/accept', { inviteID: 'x' }),
      here,
    );
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({
      message: 'The invite i d field must be an integer.',
      errors: { inviteID: ['The invite i d field must be an integer.'] },
    });
    const missing = await answerAccept(
      leaguePost('/leagues/accept', { inviteID: '-1' }),
      here,
    );
    expect(missing.status).toBe(404);
    expect(here.joined).toEqual([]);
  });
});

describe('answerDecline (LeagueController::declineInvite)', () => {
  it('drops the invite and says so on the league page', async () => {
    const here = declining();
    const answer = await answerDecline(
      leaguePost('/leagues/decline', { inviteID: '3' }),
      here,
    );
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(here.left).toEqual(['invite-declined']);
    expect(here.dropped).toEqual([{ actor: JONAS, invite: 3 }]);
  });

  it("answers another player's invite, or one already gone, with a 404", async () => {
    const answer = await answerDecline(
      leaguePost('/leagues/decline', { inviteID: '3' }),
      declining({ drop: () => Promise.resolve(refuse('not-your-invite')) }),
    );
    expect(answer.status).toBe(404);
  });

  it('answers a missing invite id with a 422', async () => {
    const answer = await answerDecline(
      leaguePost('/leagues/decline', {}),
      declining(),
    );
    expect(answer.status).toBe(422);
  });
});
