import { leagueNo, player } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FINISHED } from '../../components/admin/tournament-fixtures';

const world = vi.hoisted(() => {
  const state: {
    admin: { player: string; role: string } | null;
    tournament: unknown;
    loaded: unknown;
    calls: unknown[];
    saved: unknown;
  } = { admin: null, tournament: null, loaded: null, calls: [], saved: null };
  return state;
});

vi.mock('@sportbet/db', () => ({
  leagueExists: () => Promise.resolve(true),
  loadPaymentsPage: (_db: unknown, query: unknown) => {
    world.calls.push(['load', query]);
    return Promise.resolve(world.loaded);
  },
  savePayments: (_db: unknown, save: unknown) => {
    world.calls.push(['payments', save]);
    return Promise.resolve(world.saved);
  },
  saveDetails: (_db: unknown, save: unknown) => {
    world.calls.push(['details', save]);
    return Promise.resolve(world.saved);
  },
}));
vi.mock('../../server/db', () => ({ getDb: () => 'db' }));
vi.mock('./working-tournament', () => ({
  workingTournament: () => Promise.resolve(world.tournament),
}));
vi.mock('./gate', () => ({
  adminGate: (permission: (role: string) => boolean) =>
    Promise.resolve(
      world.admin !== null && permission(world.admin.role) ? world.admin : null,
    ),
}));
vi.mock('../leagues/league-world', () => ({
  leagueWorld: () => ({
    signedIn: () => Promise.resolve(null),
    leaveMessage: () => Promise.resolve(),
  }),
}));

const {
  ADMIN_PAYMENTS_DOOR,
  adminDetailsWorld,
  adminPaymentsWorld,
  openAdminPayments,
} = await import('./league-payments');

const BOSS = { player: player('1'), role: 'superadmin' };

beforeEach(() => {
  world.admin = BOSS;
  world.tournament = FINISHED.tournament;
  world.loaded = { ok: true, value: { league: { id: 9 } } };
  world.saved = { ok: true, value: undefined };
  world.calls = [];
});

describe("the superadmin's door to a league's payments", () => {
  it("payments: the door's page is the admin one and a refused caller goes home", () => {
    expect(ADMIN_PAYMENTS_DOOR.page(9)).toBe('/admin/leagues/9/payments');
    expect(ADMIN_PAYMENTS_DOOR.refusedAt).toBe('/');
  });

  it('payments: only a superadmin is anyone at the door', async () => {
    expect(await adminPaymentsWorld().signedIn()).toEqual(BOSS);
    world.admin = { player: player('2'), role: 'results-manager' };
    expect(await adminPaymentsWorld().signedIn()).toBeNull();
    world.admin = null;
    expect(await adminDetailsWorld().signedIn()).toBeNull();
  });

  it('payments: a save is written as a superadmin of the working tournament', async () => {
    const entry = new Map<number, null>([[12, null]]);
    const league = leagueNo(9);
    await adminPaymentsWorld().save({ actor: BOSS.player, league, entry });
    await adminDetailsWorld().save({
      actor: BOSS.player,
      league,
      entry: { beneficiary: null, iban: null, note: null },
    });
    expect(world.calls).toMatchObject([
      [
        'payments',
        {
          actor: {
            superadmin: BOSS.player,
            tournament: FINISHED.tournament.id,
          },
          league,
        },
      ],
      [
        'details',
        {
          actor: {
            superadmin: BOSS.player,
            tournament: FINISHED.tournament.id,
          },
          league,
        },
      ],
    ]);
  });

  it('payments: with no working tournament a save finds no such league and writes nothing', async () => {
    world.tournament = null;
    const league = leagueNo(9);
    expect(
      await adminPaymentsWorld().save({
        actor: BOSS.player,
        league,
        entry: new Map(),
      }),
    ).toEqual({ ok: false, refusal: 'no-such-league' });
    expect(
      await adminDetailsWorld().save({
        actor: BOSS.player,
        league,
        entry: { beneficiary: null, iban: null, note: null },
      }),
    ).toEqual({ ok: false, refusal: 'no-such-league' });
    expect(world.calls).toEqual([]);
  });
});

describe("opening the door's payments page", () => {
  it("payments: a superadmin sees the league's page, loaded as a superadmin of the working tournament", async () => {
    expect(await openAdminPayments('9')).toEqual({
      kind: 'page',
      page: { league: { id: 9 } },
    });
    expect(world.calls).toMatchObject([
      [
        'load',
        {
          actor: {
            superadmin: BOSS.player,
            tournament: FINISHED.tournament.id,
          },
          league: 9,
        },
      ],
    ]);
  });

  it('payments: anyone else goes home, a segment that is no id or no tournament is a 404, a refused league is a 404 or home', async () => {
    world.admin = { player: player('2'), role: 'results-manager' };
    expect(await openAdminPayments('9')).toEqual({ kind: 'home' });
    world.admin = BOSS;
    expect(await openAdminPayments('abc')).toEqual({ kind: 'not-found' });
    world.tournament = null;
    expect(await openAdminPayments('9')).toEqual({ kind: 'not-found' });
    world.tournament = FINISHED.tournament;
    world.loaded = { ok: false, refusal: 'no-such-league' };
    expect(await openAdminPayments('9')).toEqual({ kind: 'not-found' });
    world.loaded = { ok: false, refusal: 'not-an-admin' };
    expect(await openAdminPayments('9')).toEqual({ kind: 'home' });
  });
});
