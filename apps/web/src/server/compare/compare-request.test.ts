import {
  ok,
  refuse,
  type CompareRefusal,
  type Comparison,
  type PlayerId,
  type Result,
} from '@sportbet/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  comparison,
  JONAS,
  side,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { answerCompare, guestSignInFor } from './compare-request';

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

describe('answerCompare (CompareController::show)', () => {
  const compared = comparison(side(JONAS, 'jonas'), side(ZUKAUSKAS, 'zuk'));
  const signedIn = { signedIn: true, inTournament: true };

  it('hands the comparison on, loaded for the player the address names', async () => {
    const load = vi.fn<
      (other: PlayerId) => Promise<Result<Comparison, CompareRefusal>>
    >(() => Promise.resolve(ok(compared)));
    expect(await answerCompare('2', { ...signedIn, load })).toEqual({
      kind: 'comparison',
      comparison: compared,
    });
    expect(load).toHaveBeenCalledWith(ZUKAUSKAS);
  });

  it('comparing oneself is its own answer', async () => {
    const load = () => Promise.resolve(refuse('self' as const));
    expect(await answerCompare('1', { ...signedIn, load })).toEqual({
      kind: 'self',
    });
  });

  it("a player outside the tournament's listed players is not found (R-73)", async () => {
    const load = () => Promise.resolve(refuse('not-listed' as const));
    expect(await answerCompare('3', { ...signedIn, load })).toEqual({
      kind: 'not-found',
    });
  });

  it.each(['abc', '+1', '', '1.5'])(
    'a userID of %j matches no route: not found, even for a guest',
    async (text) => {
      const load = vi.fn();
      for (const request of [
        signedIn,
        { signedIn: false, inTournament: false },
      ]) {
        expect(await answerCompare(text, { ...request, load })).toEqual({
          kind: 'not-found',
        });
      }
      expect(load).not.toHaveBeenCalled();
    },
  );

  it('a guest is for sign-in, whatever the digits, and nothing is loaded', async () => {
    const load = vi.fn();
    for (const text of ['2', '0', '007']) {
      expect(
        await answerCompare(text, {
          signedIn: false,
          inTournament: false,
          load,
        }),
      ).toEqual({ kind: 'guest' });
    }
    expect(load).not.toHaveBeenCalled();
  });

  it.each(['0', '007', '2147483648'])(
    'the digits %j are no id: not found for a player',
    async (text) => {
      const load = vi.fn();
      expect(await answerCompare(text, { ...signedIn, load })).toEqual({
        kind: 'not-found',
      });
      expect(load).not.toHaveBeenCalled();
    },
  );

  it('a player in no tournament has no table to compare in', async () => {
    const load = vi.fn();
    expect(
      await answerCompare('2', { signedIn: true, inTournament: false, load }),
    ).toEqual({ kind: 'no-tournament' });
    expect(load).not.toHaveBeenCalled();
  });
});
