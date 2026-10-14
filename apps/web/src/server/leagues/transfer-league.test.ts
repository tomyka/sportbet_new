import { ok, refuse } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeLeagueWorld,
  leaguePost,
  type LeftMessages,
} from '../../../tests/support/league-requests';
import { asLeague } from './id-field';
import { answerTransfer, type TransferWorld } from './transfer-league';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');

function world(
  overrides: Partial<TransferWorld> = {},
): TransferWorld & LeftMessages & { readonly handed: unknown[] } {
  const handed: unknown[] = [];
  return {
    ...fakeLeagueWorld(JONAS),
    handOver: (hand) => {
      handed.push(hand);
      return Promise.resolve(ok(undefined));
    },
    ...overrides,
    handed,
  };
}

const post = (fields: Record<string, string>) =>
  leaguePost('/leagues/transfer', fields, {
    referer: 'https://sportbet.example/leagues',
  });

describe('answerTransfer (R-23, R-119)', () => {
  it('hands the league to the member and says so on the league page', async () => {
    const here = world();
    const answer = await answerTransfer(
      post({ leagueID: '7', memberID: '9' }),
      here,
    );
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(here.left).toEqual(['league-handed-over']);
    expect(here.handed).toEqual([
      { actor: JONAS, league: asLeague(7), to: player('9') },
    ]);
  });

  it.each([
    ['public', 'transfer-public'],
    ['not-owner', 'transfer-not-owner'],
    ['not-a-member', 'transfer-not-a-member'],
    ['already-owner', 'transfer-already-owner'],
  ] as const)(
    'says %s as an error message, back to the page the form came from',
    async (refusal, message) => {
      const here = world({ handOver: () => Promise.resolve(refuse(refusal)) });
      const answer = await answerTransfer(
        post({ leagueID: '7', memberID: '9' }),
        here,
      );
      expect(answer.status).toBe(303);
      expect(here.left).toEqual([message]);
    },
  );

  it('answers a league that is not there with a 404', async () => {
    const answer = await answerTransfer(
      post({ leagueID: '7', memberID: '9' }),
      world({ handOver: () => Promise.resolve(refuse('no-such-league')) }),
    );
    expect(answer.status).toBe(404);
  });

  it.each([
    [{ leagueID: '7' }, 'memberID', 'The member i d field is required.'],
    [
      { leagueID: 'x', memberID: '9' },
      'leagueID',
      'The league i d field must be an integer.',
    ],
  ])(
    'answers an id Laravel refuses with a 422: %o',
    async (fields, field, message) => {
      const here = world();
      const answer = await answerTransfer(post(fields), here);
      expect(answer.status).toBe(422);
      expect(await answer.json()).toEqual({
        message,
        errors: { [field]: [message] },
      });
      expect(here.handed).toEqual([]);
    },
  );

  it('answers a member id no account has with a 404', async () => {
    const answer = await answerTransfer(
      post({ leagueID: '7', memberID: '0' }),
      world(),
    );
    expect(answer.status).toBe(404);
  });
});
