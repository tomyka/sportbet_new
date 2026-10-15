import { isAdmin, isSuperadmin, type Role } from '@sportbet/domain';
import { at, gameNo, player } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sealConfirmation, type PendingConfirmation } from './pending';

const SECRET = 'test-secret-test-secret-test-secret';

const world = vi.hoisted(() => {
  const state: {
    cookie: string | undefined;
    admin: { player: string; role: Role } | null;
    asked: ((role: Role) => boolean)[];
    description: string | null;
  } = { cookie: undefined, admin: null, asked: [], description: null };
  return state;
});

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === '__Host-sb_confirm' && world.cookie !== undefined
          ? { value: world.cookie }
          : undefined,
    }),
}));
vi.mock('../../../env', () => ({ env: () => ({ AUTH_SECRET: SECRET }) }));
vi.mock('../../clock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../clock')>()),
  now: () => at('2026-10-14T12:01:00Z'),
}));
vi.mock('../gate', () => ({
  adminGate: (permission: (role: Role) => boolean) => {
    world.asked.push(permission);
    return Promise.resolve(
      world.admin !== null && permission(world.admin.role) ? world.admin : null,
    );
  },
}));
vi.mock('./actions', async () => {
  const real = await vi.importActual<typeof import('./actions')>('./actions');
  return {
    permissionOf: real.permissionOf,
    goneText: real.goneText,
    describeAction: () =>
      Promise.resolve(
        world.description === null
          ? null
          : { page: world.description, mail: 'mail' },
      ),
  };
});

const { loadConfirmPage } = await import('./confirm-page');

const PENDING: PendingConfirmation = {
  account: player('7'),
  action: { kind: 'delete-game', game: gameNo(412) },
  issuedAt: at('2026-10-14T12:00:00Z'),
};

beforeEach(() => {
  world.cookie = sealConfirmation(PENDING, SECRET);
  world.admin = { player: '7', role: 'superadmin' };
  world.asked = [];
  world.description = 'Ištrinti žaidimą #412';
});

describe('the emailed confirmation page (R-26 amended)', () => {
  it("shows the pending action to the account that asked, behind the action's own permission", async () => {
    expect(await loadConfirmPage()).toEqual({
      kind: 'ask',
      description: 'Ištrinti žaidimą #412',
    });
    expect(world.asked).toEqual([isSuperadmin]);
  });

  it('with nothing pending, asks any admin and sends them to the dashboard', async () => {
    world.cookie = undefined;
    expect(await loadConfirmPage()).toEqual({ kind: 'dashboard' });
    expect(world.asked).toEqual([isAdmin]);
  });

  it("a role the action's permission refuses goes home, as does a guest", async () => {
    world.admin = { player: '7', role: 'results-manager' };
    expect(await loadConfirmPage()).toEqual({ kind: 'home' });
    world.admin = null;
    expect(await loadConfirmPage()).toEqual({ kind: 'home' });
  });

  it('a cookie another account asked for is not shown', async () => {
    world.admin = { player: '8', role: 'superadmin' };
    expect(await loadConfirmPage()).toEqual({ kind: 'dashboard' });
  });

  it('a game gone since the ask goes to the dashboard; an account, a league or a message says so, with no code box', async () => {
    world.description = null;
    expect(await loadConfirmPage()).toEqual({ kind: 'dashboard' });
    world.cookie = sealConfirmation(
      { ...PENDING, action: { kind: 'delete-user', player: player('9') } },
      SECRET,
    );
    expect(await loadConfirmPage()).toEqual({
      kind: 'gone',
      text: 'Paskyra nebeegzistuoja.',
    });
  });

  it('a forged or expired cookie is nothing pending', async () => {
    world.cookie = 'forged.value';
    expect(await loadConfirmPage()).toEqual({ kind: 'dashboard' });
  });
});
