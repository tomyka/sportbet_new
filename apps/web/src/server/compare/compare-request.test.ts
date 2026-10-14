import { ok, refuse } from '@sportbet/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  comparison,
  JONAS,
  side,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { comparisonOrLeave, guestSignInFor } from './compare-request';

// Next's redirect and notFound throw to leave the page; here they say where.
vi.mock('next/navigation', () => ({
  redirect: (to: string): never => {
    throw new Error(`redirect ${to}`);
  },
  notFound: (): never => {
    throw new Error('not found');
  },
}));

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
