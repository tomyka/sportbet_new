import { ok, refuse, type Tournament } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeLeagueWorld,
  leaguePost,
  type LeftMessages,
} from '../../../tests/support/league-requests';
import { answerCreate, type CreateWorld } from './create-league';
import { asLeague } from './id-field';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');
const EUROLEAGUE: Tournament = {
  id: 4,
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};

function world(
  overrides: Partial<CreateWorld> = {},
): CreateWorld & LeftMessages & { readonly founded: unknown[] } {
  const founded: unknown[] = [];
  return {
    ...fakeLeagueWorld(JONAS),
    tournament: () => Promise.resolve(EUROLEAGUE),
    found: (found) => {
      founded.push(found);
      return Promise.resolve(ok({ league: asLeague(5) }));
    },
    ...overrides,
    founded,
  };
}

describe('answerCreate (LeagueController::create)', () => {
  it("founds the league in the request's tournament and says so on the league page", async () => {
    const here = world();
    const answer = await answerCreate(
      leaguePost('/leagues/create', {
        name: ' Draugai ',
        base_fee: '10',
      }),
      here,
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(here.left).toEqual(['league-created']);
    expect(here.founded).toEqual([
      {
        player: JONAS,
        entry: {
          name: 'Draugai',
          description: null,
          baseFee: 10,
          penaltyStep: null,
          reward: null,
        },
        tournament: EUROLEAGUE,
      },
    ]);
  });

  it('lists every refused field as a 422 and founds nothing', async () => {
    const here = world();
    const answer = await answerCreate(
      leaguePost('/leagues/create', { name: '', base_fee: '-1' }),
      here,
    );
    expect(answer.status).toBe(422);
    expect(await answer.json()).toEqual({
      message: 'The name field is required. (and 1 more error)',
      errors: {
        name: ['The name field is required.'],
        base_fee: ['The base fee field must be at least 0.'],
      },
    });
    expect(here.founded).toEqual([]);
    expect(here.left).toEqual([]);
  });

  it('checks the form before it asks for a tournament', async () => {
    const asked = vi.fn(() => Promise.resolve(null));
    await answerCreate(
      leaguePost('/leagues/create', { name: '' }),
      world({ tournament: asked }),
    );
    expect(asked).not.toHaveBeenCalled();
  });

  it('says no tournament is chosen when the write refuses (issue 272)', async () => {
    const here = world({
      tournament: () => Promise.resolve(null),
      found: () => Promise.resolve(refuse('no-tournament')),
    });
    const answer = await answerCreate(
      leaguePost('/leagues/create', { name: 'Draugai' }),
      here,
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(here.left).toEqual(['no-tournament']);
  });
});
