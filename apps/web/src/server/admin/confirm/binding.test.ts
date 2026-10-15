import { gameNo } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { actionBinding } from './binding';

describe('the binding of an action', () => {
  it('is a sha-256 digest, the same for the same action', () => {
    const action = { kind: 'delete-game', game: gameNo(5) } as const;
    expect(actionBinding(action)).toMatch(/^[0-9a-f]{64}$/);
    expect(actionBinding({ ...action })).toBe(actionBinding(action));
  });

  it('does not depend on the order of the action fields', () => {
    expect(actionBinding({ game: gameNo(5), kind: 'delete-game' })).toBe(
      actionBinding({ kind: 'delete-game', game: gameNo(5) }),
    );
  });

  it('differs for another game', () => {
    expect(actionBinding({ kind: 'delete-game', game: gameNo(5) })).not.toBe(
      actionBinding({ kind: 'delete-game', game: gameNo(6) }),
    );
  });
});
