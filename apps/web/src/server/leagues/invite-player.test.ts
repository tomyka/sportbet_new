import { ok, refuse } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeLeagueWorld,
  leaguePost,
  type LeftMessages,
} from '../../../tests/support/league-requests';
import { asLeague } from './id-field';
import { answerInvite, type InviteWorld } from './invite-player';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');
const FROM = 'https://sportbet.example/leagues';

function world(
  overrides: Partial<InviteWorld> = {},
): InviteWorld & LeftMessages & { readonly sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    ...fakeLeagueWorld(JONAS),
    isAdmin: () => Promise.resolve(true),
    invite: (send) => {
      sent.push(send);
      return Promise.resolve(ok(undefined));
    },
    ...overrides,
    sent,
  };
}

const post = (fields: Record<string, string>) =>
  leaguePost('/leagues/invite', fields, { referer: FROM });

describe('answerInvite (LeagueController::invite)', () => {
  it('sends the invite and goes back to the referring page with the message', async () => {
    const here = world();
    const answer = await answerInvite(
      post({ leagueID: '7', invitedUserID: '9' }),
      here,
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(here.left).toEqual(['invite-sent']);
    expect(here.sent).toEqual([
      { actor: JONAS, league: asLeague(7), invitee: player('9') },
    ]);
  });

  it('goes back to the page the form came from, not always the league page', async () => {
    const answer = await answerInvite(
      leaguePost(
        '/leagues/invite',
        { leagueID: '7', invitedUserID: '9' },
        { referer: 'https://sportbet.example/main' },
      ),
      world(),
    );
    expect(answer.headers.get('location')).toBe('/main');
  });

  it.each([
    [
      { leagueID: '', invitedUserID: '9' },
      'leagueID',
      'The league i d field is required.',
    ],
    [
      { leagueID: '7', invitedUserID: 'x' },
      'invitedUserID',
      'The invited user i d field must be an integer.',
    ],
  ])(
    'answers an id Laravel refuses with a 422: %o',
    async (fields, field, message) => {
      const here = world();
      const answer = await answerInvite(post(fields), here);
      expect(answer.status).toBe(422);
      expect(await answer.json()).toEqual({
        message,
        errors: { [field]: [message] },
      });
      expect(here.sent).toEqual([]);
    },
  );

  it('answers a non-admin with a 404 before the invitee id is looked at', async () => {
    const here = world({ isAdmin: () => Promise.resolve(false) });
    const answer = await answerInvite(
      post({ leagueID: '7', invitedUserID: 'x' }),
      here,
    );
    expect(answer.status).toBe(404);
    expect(here.sent).toEqual([]);
  });

  it('answers an invitee id no account has with a 404', async () => {
    const answer = await answerInvite(
      post({ leagueID: '7', invitedUserID: '0' }),
      world(),
    );
    expect(answer.status).toBe(404);
  });

  it.each([
    ['already-member-or-invited', 'already-member-or-invited'],
    ['not-in-tournament', 'invitee-not-in-tournament'],
  ] as const)('says %s as an error message, back', async (refusal, message) => {
    const here = world({ invite: () => Promise.resolve(refuse(refusal)) });
    const answer = await answerInvite(
      post({ leagueID: '7', invitedUserID: '9' }),
      here,
    );
    expect(answer.status).toBe(303);
    expect(here.left).toEqual([message]);
  });

  it.each(['not-an-admin', 'no-such-league'] as const)(
    'answers %s with a 404 and no message',
    async (refusal) => {
      const here = world({ invite: () => Promise.resolve(refuse(refusal)) });
      const answer = await answerInvite(
        post({ leagueID: '7', invitedUserID: '9' }),
        here,
      );
      expect(answer.status).toBe(404);
      expect(here.left).toEqual([]);
    },
  );
});
