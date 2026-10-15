import { leagueId, type ConfirmableAction } from '@sportbet/domain';
import { gameNo, player, unwrap } from '@sportbet/domain/testing';
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

  it('differs between every kind and every field of the slice 14 kinds: a code mailed for one never confirms another', () => {
    const actions: ConfirmableAction[] = [
      { kind: 'delete-game', game: gameNo(5) },
      { kind: 'delete-user', player: player('5') },
      { kind: 'delete-user', player: player('6') },
      { kind: 'change-role', player: player('5'), role: 'superadmin' },
      { kind: 'change-role', player: player('5'), role: 'player' },
      { kind: 'change-role', player: player('6'), role: 'superadmin' },
      { kind: 'delete-league-message', message: 5 },
      { kind: 'delete-league', league: unwrap(leagueId(5)) },
    ];
    const bindings = actions.map(actionBinding);
    expect(new Set(bindings).size).toBe(actions.length);
  });
});
