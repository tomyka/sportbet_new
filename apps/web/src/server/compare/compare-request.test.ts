import { ok, refuse } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  comparison,
  JONAS,
  side,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import {
  comparisonOrLeave,
  guestSignInFor,
  isRouteUserId,
  otherPlayerOf,
} from './compare-request';

// Next's redirect and notFound throw to leave the page; here they say where.
vi.mock('next/navigation', () => ({
  redirect: (to: string): never => {
    throw new Error(`redirect ${to}`);
  },
  notFound: (): never => {
    throw new Error('not found');
  },
}));

describe("otherPlayerOf (the route's [0-9]+ userID, read as every typed id is)", () => {
  it('reads a stored id as the player', () => {
    expect(otherPlayerOf('7')).toEqual(ok(player('7')));
    expect(otherPlayerOf('2147483647')).toEqual(ok(player('2147483647')));
  });

  it.each(['', '0', '+1', '007', 'abc', '1.5', '2147483648'])(
    'refuses %j, which is no id',
    (text) => {
      expect(otherPlayerOf(text).ok).toBe(false);
    },
  );
});

describe("isRouteUserId (sportbet's [0-9]+ route constraint)", () => {
  it.each(['0', '7', '007', '2147483648', '99999999999999999999'])(
    'matches %j, all digits',
    (text) => {
      expect(isRouteUserId(text)).toBe(true);
    },
  );

  it.each(['', 'abc', '+1', '1.5', '-1', '1a', '1\n'])(
    'does not match %j',
    (text) => {
      expect(isRouteUserId(text)).toBe(false);
    },
  );
});

describe('guestSignInFor (the auth middleware, before the controller)', () => {
  it('sends a guest to sign in and back to a real id', () => {
    expect(guestSignInFor('2')).toBe('/login?intended=%2Fcompare%2F2');
  });

  it.each(['0', '007', '2147483648', '99999999999999999999'])(
    'sends a guest from the digits %j to sign in, with no page to return to',
    (text) => {
      expect(guestSignInFor(text)).toBe('/login');
    },
  );
});

describe('comparisonOrLeave (CompareController::show)', () => {
  const compared = comparison(side(JONAS, 'jonas'), side(ZUKAUSKAS, 'zuk'));

  it('hands the comparison on', () => {
    expect(comparisonOrLeave(ok(compared))).toBe(compared);
  });

  it('comparing oneself goes to the game page', () => {
    expect(() => comparisonOrLeave(refuse('self'))).toThrow('redirect /main');
  });

  it("a player outside the tournament's listed players is a 404", () => {
    expect(() => comparisonOrLeave(refuse('not-listed'))).toThrow('not found');
  });
});
