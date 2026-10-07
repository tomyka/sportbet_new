import {
  isAdmin,
  mayEnterResults,
  mayRecalculate,
  type Role,
} from '@sportbet/domain';
import { describe, expect, it, vi } from 'vitest';

const signedIn = vi.hoisted(() => {
  const state: { value: null | { readonly role: Role } } = { value: null };
  return state;
});

vi.mock('../request-context', () => ({
  signedInPlayer: () => Promise.resolve(signedIn.value),
}));

const { adminGate } = await import('./gate');

describe('the admin gate (AdminMiddleware, R-26 amended), named by the permission it checks', () => {
  it.each([
    ['isAdmin', isAdmin],
    ['mayEnterResults', mayEnterResults],
    ['mayRecalculate', mayRecalculate],
  ] as const)(
    'gate (%s): a guest and a player are refused, both admin roles let in',
    async (_name, permission) => {
      for (const [who, allowed] of [
        [null, false],
        [{ role: 'player' }, false],
        [{ role: 'results-manager' }, true],
        [{ role: 'superadmin' }, true],
      ] as const) {
        signedIn.value = who;
        expect((await adminGate(permission)) !== null).toBe(allowed);
      }
    },
  );

  it("gate: asks the given permission of the signed-in player's role, and nothing else", async () => {
    signedIn.value = { role: 'results-manager' };
    const asked: Role[] = [];
    const onlySuperadmin = (role: Role) => {
      asked.push(role);
      return role === 'superadmin';
    };
    expect(await adminGate(onlySuperadmin)).toBeNull();
    expect(asked).toEqual(['results-manager']);
    signedIn.value = { role: 'superadmin' };
    expect(await adminGate(onlySuperadmin)).toEqual({ role: 'superadmin' });
  });

  it('gate: a guest is refused without asking the permission', async () => {
    signedIn.value = null;
    const permission = vi.fn(() => true);
    expect(await adminGate(permission)).toBeNull();
    expect(permission).not.toHaveBeenCalled();
  });
});
