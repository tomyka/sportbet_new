import { ok, refuse, type PaymentsPage } from '@sportbet/domain';
import { leagueNo, player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { openPayments, type OpenPaymentsWorld } from './open-payments';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');

const PAGE: PaymentsPage = {
  league: { id: leagueNo(9), name: 'Draugų lyga' },
  hasFee: true,
  meter: {
    collected: '0.00',
    expected: '40.00',
    paidCount: 0,
    memberCount: 2,
    percent: 0,
  },
  rows: [],
  details: { beneficiary: '', iban: '', note: '' },
};

function world(
  overrides: Partial<OpenPaymentsWorld> = {},
): OpenPaymentsWorld & { readonly asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    signedIn: () => Promise.resolve({ player: JONAS }),
    load: (query) => {
      asked.push(query);
      return Promise.resolve(ok(PAGE));
    },
    ...overrides,
    asked,
  };
}

const guest: Pick<OpenPaymentsWorld, 'signedIn'> = {
  signedIn: () => Promise.resolve(null),
};

describe('openPayments (LeaguePaymentController::edit)', () => {
  it("opens the league's page for the player the loader allows", async () => {
    const here = world();
    expect(await openPayments('9', here)).toEqual({ kind: 'page', page: PAGE });
    expect(here.asked).toEqual([{ actor: JONAS, league: 9 }]);
  });

  it('a guest signs in and comes back to the page', async () => {
    expect(await openPayments('9', world(guest))).toEqual({
      kind: 'redirect',
      to: `/login?intended=${encodeURIComponent('/leagues/9/payments')}`,
    });
  });

  it('a guest asking for a segment that is no league goes to plain /login', async () => {
    expect(await openPayments('abc', world(guest))).toEqual({
      kind: 'redirect',
      to: '/login',
    });
  });

  it.each(['abc', '0', '-1', '2147483648'])(
    'a player asking for the segment %j finds no league, and nothing is loaded',
    async (segment) => {
      const here = world();
      expect(await openPayments(segment, here)).toEqual({ kind: 'not-found' });
      expect(here.asked).toEqual([]);
    },
  );

  it('a league that is not there is a 404', async () => {
    const here = world({
      load: () => Promise.resolve(refuse('no-such-league')),
    });
    expect(await openPayments('9', here)).toEqual({ kind: 'not-found' });
  });

  it.each(['public-league', 'not-an-admin'] as const)(
    "the refusal %s (sportbet's 403) goes home",
    async (refusal) => {
      const here = world({ load: () => Promise.resolve(refuse(refusal)) });
      expect(await openPayments('9', here)).toEqual({
        kind: 'redirect',
        to: '/',
      });
    },
  );
});
