import type { AdminUser } from '@sportbet/db';
import {
  confirmableActionSchema,
  emailAddress,
  isAdmin,
  isSuperadmin,
  leagueId,
  mayEnterResults,
  ROLES,
  type ConfirmableAction,
  type Role,
  type Tournament,
} from '@sportbet/domain';
import { at, gameNo, player, unwrap } from '@sportbet/domain/testing';
import { FINISHED } from '../../../components/admin/tournament-fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => {
  const state: {
    user: AdminUser | null;
    tournament: Tournament | null;
    league: { league: { name: string } } | null;
    message: object | null;
    calls: unknown[][];
    answers: Record<string, unknown>;
  } = {
    user: null,
    tournament: null,
    league: null,
    message: null,
    calls: [],
    answers: {},
  };
  return state;
});

const called =
  (name: string) =>
  (...args: unknown[]) => {
    world.calls.push([name, ...args]);
    return Promise.resolve(world.answers[name]);
  };

vi.mock('@sportbet/db', () => ({
  findAdminUser: () => Promise.resolve(world.user),
  findAdminLeague: () => Promise.resolve(world.league),
  findAdminMessage: () => Promise.resolve(world.message),
  deleteAccount: called('deleteAccount'),
  changeRole: called('changeRole'),
  deleteLeagueAsSuperadmin: called('deleteLeagueAsSuperadmin'),
  deleteMessage: called('deleteMessage'),
  deleteGame: called('deleteGame'),
  findAdminGame: () => Promise.resolve(null),
}));
vi.mock('../../db', () => ({ getDb: () => 'db' }));
vi.mock('../../../server/db', () => ({ getDb: () => 'db' }));
vi.mock('../working-tournament', () => ({
  workingTournament: () => Promise.resolve(world.tournament),
}));
vi.mock('../../points-changed', () => ({
  pointsChanged: () => {
    world.calls.push(['pointsChanged']);
  },
}));

const { describeAction, goneText, performAction, permissionOf } =
  await import('./actions');

const ADMIN = player('7');
const TARGET = player('9');
const NOW = at('2026-10-14T12:00:00Z');

const USER: AdminUser = {
  id: TARGET,
  username: 'zaidejas',
  name: 'Jonas',
  surname: 'Petraitis',
  email: unwrap(emailAddress('jonas@example.lt')),
  role: 'player',
  standing: null,
};

const ACTIONS: readonly ConfirmableAction[] = [
  { kind: 'delete-game', game: gameNo(412) },
  { kind: 'delete-user', player: TARGET },
  { kind: 'change-role', player: TARGET, role: 'superadmin' },
  { kind: 'delete-league-message', message: 5 },
  { kind: 'delete-league', league: unwrap(leagueId(3)) },
];

const performer = { admin: ADMIN, tournament: null, at: NOW };

beforeEach(() => {
  world.user = USER;
  world.tournament = FINISHED.tournament;
  world.league = null;
  world.message = null;
  world.calls = [];
  world.answers = {};
});

describe('the confirmable kinds (R-26 amended, R-118)', () => {
  it.each(ACTIONS.map((action) => [action.kind, action] as const))(
    "actions: %s is a superadmin's alone, never a results manager's or a player's",
    (_kind, action) => {
      const permission = permissionOf(action);
      const allowed = ROLES.filter((role: Role) => permission(role));
      expect(allowed).toEqual(['superadmin']);
      expect(permission).toBe(isSuperadmin);
      expect(isAdmin('results-manager')).toBe(true);
      expect(mayEnterResults('results-manager')).toBe(true);
    },
  );

  it('actions: every kind the cookie schema accepts has a definition', () => {
    for (const action of ACTIONS) {
      expect(confirmableActionSchema.safeParse(action).success).toBe(true);
      expect(() => permissionOf(action)).not.toThrow();
    }
  });
});

describe('what each kind says it will do, read from the database', () => {
  it('actions: a deletion names the account and its address on the page, and only its number in the mail', async () => {
    expect(
      await describeAction({ kind: 'delete-user', player: TARGET }, ADMIN),
    ).toEqual({
      page: 'Ištrinti paskyrą zaidejas (jonas@example.lt)',
      mail: 'Ištrinti paskyrą #9',
    });
  });

  it('actions: a role change names the account and both roles, the mail only the number and the new role', async () => {
    expect(
      await describeAction(
        { kind: 'change-role', player: TARGET, role: 'superadmin' },
        ADMIN,
      ),
    ).toEqual({
      page: 'Pakeisti zaidejas rolę: Žaidėjas -> Superadministratorius',
      mail: 'Pakeisti paskyros #9 rolę į: Superadministratorius',
    });
  });

  it('actions: a league deletion names the league on the page and only its number in the mail', async () => {
    world.league = { league: { name: 'Draugu lyga' } };
    expect(
      await describeAction(
        { kind: 'delete-league', league: unwrap(leagueId(3)) },
        ADMIN,
      ),
    ).toEqual({ page: 'Ištrinti lygą Draugu lyga', mail: 'Ištrinti lygą #3' });
  });

  it('actions: a message deletion names only its number', async () => {
    world.message = { message: { id: 5, text: 'a secret' } };
    expect(
      await describeAction(
        { kind: 'delete-league-message', message: 5 },
        ADMIN,
      ),
    ).toEqual({
      page: 'Ištrinti žinutę #5',
      mail: 'Ištrinti žinutę #5',
    });
  });

  it('actions: a target gone since the ask describes nothing and has its own words', async () => {
    world.user = null;
    world.league = null;
    world.message = null;
    const gone = [
      [{ kind: 'delete-user', player: TARGET }, 'Paskyra nebeegzistuoja.'],
      [
        { kind: 'change-role', player: TARGET, role: 'player' },
        'Paskyra nebeegzistuoja.',
      ],
      [{ kind: 'delete-league', league: unwrap(leagueId(3)) }, 'Lygos nebėra.'],
      [{ kind: 'delete-league-message', message: 5 }, 'Žinutės nebėra.'],
    ] as const;
    for (const [action, text] of gone) {
      expect(await describeAction(action, ADMIN)).toBeNull();
      expect(goneText(action)).toBe(text);
    }
    expect(goneText({ kind: 'delete-game', game: gameNo(1) })).toBeNull();
  });

  it('actions: a league or a message of no working tournament is not there', async () => {
    world.tournament = null;
    world.league = { league: { name: 'x' } };
    world.message = { message: {} };
    expect(
      await describeAction(
        { kind: 'delete-league', league: unwrap(leagueId(3)) },
        ADMIN,
      ),
    ).toBeNull();
    expect(
      await describeAction(
        { kind: 'delete-league-message', message: 5 },
        ADMIN,
      ),
    ).toBeNull();
  });
});

describe('performing a confirmed action: the actor is the session player, the writer decides again', () => {
  it('actions: delete-user deletes as the admin the confirm route passed, refreshes the boards and says who went', async () => {
    world.answers['deleteAccount'] = { ok: true, value: { handedOver: [] } };
    const answer = await performAction(
      { kind: 'delete-user', player: TARGET },
      performer,
    );
    expect(world.calls).toEqual([
      [
        'deleteAccount',
        'db',
        { target: TARGET, by: { admin: ADMIN }, now: NOW },
      ],
      ['pointsChanged'],
    ]);
    expect(answer).toEqual({
      kind: 'redirect',
      to: '/admin/users',
      flash: { kind: 'admin', message: 'user-deleted', name: 'zaidejas' },
    });
  });

  it.each([
    ['own-account', 'own-account'],
    ['last-superadmin', 'last-superadmin'],
    ['no-such-account', 'account-gone'],
  ] as const)(
    'actions: delete-user refused as %s flashes %s and refreshes nothing',
    async (refusal, message) => {
      world.answers['deleteAccount'] = { ok: false, refusal };
      const answer = await performAction(
        { kind: 'delete-user', player: TARGET },
        performer,
      );
      expect(answer).toMatchObject({ flash: { message } });
      expect(world.calls.map(([name]) => name)).toEqual(['deleteAccount']);
    },
  );

  it('actions: an actor no longer a superadmin is sent home, and a target gone before the writer is not attempted', async () => {
    world.answers['deleteAccount'] = {
      ok: false,
      refusal: 'actor-not-superadmin',
    };
    expect(
      await performAction({ kind: 'delete-user', player: TARGET }, performer),
    ).toEqual({ kind: 'home' });
    world.user = null;
    world.calls = [];
    expect(
      await performAction({ kind: 'delete-user', player: TARGET }, performer),
    ).toMatchObject({ flash: { message: 'account-gone' } });
    expect(world.calls).toEqual([]);
  });

  it("actions: change-role writes as the session admin with the cookie's account and role", async () => {
    world.answers['changeRole'] = { ok: true, value: {} };
    const answer = await performAction(
      { kind: 'change-role', player: TARGET, role: 'results-manager' },
      performer,
    );
    expect(world.calls).toEqual([
      [
        'changeRole',
        'db',
        { actor: ADMIN, target: TARGET, role: 'results-manager', now: NOW },
      ],
    ]);
    expect(answer).toMatchObject({
      to: '/admin/users',
      flash: { message: 'user-updated', name: 'zaidejas' },
    });
  });

  it.each([
    ['own-role', 'own-role'],
    ['same-role', 'same-role'],
    ['last-superadmin', 'last-superadmin-role'],
    ['no-such-account', 'account-gone'],
  ] as const)(
    'actions: change-role refused as %s flashes %s',
    async (refusal, message) => {
      world.answers['changeRole'] = { ok: false, refusal };
      expect(
        await performAction(
          { kind: 'change-role', player: TARGET, role: 'player' },
          performer,
        ),
      ).toMatchObject({ flash: { message } });
    },
  );

  it('actions: change-role by an actor who is no superadmin any more goes home', async () => {
    world.answers['changeRole'] = {
      ok: false,
      refusal: 'actor-not-superadmin',
    };
    expect(
      await performAction(
        { kind: 'change-role', player: TARGET, role: 'player' },
        performer,
      ),
    ).toEqual({ kind: 'home' });
  });

  it('actions: delete-league and delete-message act in the working tournament passed, and refuse with none', async () => {
    const league = unwrap(leagueId(3));
    world.answers['deleteLeagueAsSuperadmin'] = { ok: true, value: undefined };
    world.answers['deleteMessage'] = { ok: true, value: undefined };
    const working = { ...performer, tournament: FINISHED.tournament };
    expect(
      await performAction({ kind: 'delete-league', league }, working),
    ).toMatchObject({
      to: '/admin/leagues',
      flash: { message: 'admin-league-deleted' },
    });
    expect(
      await performAction(
        { kind: 'delete-league-message', message: 5 },
        working,
      ),
    ).toMatchObject({
      to: '/admin/messages',
      flash: { message: 'message-deleted', number: 5 },
    });
    expect(world.calls).toEqual([
      [
        'deleteLeagueAsSuperadmin',
        'db',
        { actor: ADMIN, tournament: FINISHED.tournament.id, league },
      ],
      [
        'deleteMessage',
        'db',
        { actor: ADMIN, tournament: FINISHED.tournament.id, message: 5 },
      ],
    ]);
    world.calls = [];
    expect(
      await performAction({ kind: 'delete-league', league }, performer),
    ).toMatchObject({ flash: { message: 'no-tournament' } });
    expect(
      await performAction(
        { kind: 'delete-league-message', message: 5 },
        performer,
      ),
    ).toMatchObject({ flash: { message: 'no-tournament' } });
    expect(world.calls).toEqual([]);
  });

  it.each([
    ['public', 'league-public'],
    ['no-such-league', 'league-gone'],
  ] as const)(
    'actions: delete-league refused as %s flashes %s',
    async (refusal, message) => {
      world.answers['deleteLeagueAsSuperadmin'] = { ok: false, refusal };
      expect(
        await performAction(
          { kind: 'delete-league', league: unwrap(leagueId(3)) },
          { ...performer, tournament: FINISHED.tournament },
        ),
      ).toMatchObject({ flash: { message } });
    },
  );

  it('actions: delete-league and delete-message by an actor who lost the role go home; a message gone is said so', async () => {
    const working = { ...performer, tournament: FINISHED.tournament };
    world.answers['deleteLeagueAsSuperadmin'] = {
      ok: false,
      refusal: 'actor-not-superadmin',
    };
    expect(
      await performAction(
        { kind: 'delete-league', league: unwrap(leagueId(3)) },
        working,
      ),
    ).toEqual({ kind: 'home' });
    world.answers['deleteMessage'] = {
      ok: false,
      refusal: 'actor-not-allowed',
    };
    expect(
      await performAction(
        { kind: 'delete-league-message', message: 5 },
        working,
      ),
    ).toEqual({ kind: 'home' });
    world.answers['deleteMessage'] = { ok: false, refusal: 'no-such-message' };
    expect(
      await performAction(
        { kind: 'delete-league-message', message: 5 },
        working,
      ),
    ).toMatchObject({ flash: { message: 'message-gone' } });
  });
});
