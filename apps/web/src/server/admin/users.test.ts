import type { AdminUser, SignedInPlayer } from '@sportbet/db';
import { emailAddress, type Role } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FINISHED } from '../../components/admin/tournament-fixtures';

const world = vi.hoisted(() => {
  const state: {
    users: unknown[];
    tournament: unknown;
    hidden: unknown;
    asked: unknown[];
    hid: unknown[];
    refreshed: number;
  } = {
    users: [],
    tournament: null,
    hidden: null,
    asked: [],
    hid: [],
    refreshed: 0,
  };
  return state;
});

vi.mock('@sportbet/db/admin', () => ({
  loadAdminUsers: () => Promise.resolve(world.users),
}));
vi.mock('@sportbet/db/league', () => ({
  setAdminHidden: (_db: unknown, write: unknown) => {
    world.hid.push(write);
    return Promise.resolve(world.hidden);
  },
}));
vi.mock('../../server/db', () => ({ getDb: () => 'db' }));
vi.mock('./working-tournament', () => ({
  workingTournament: () => Promise.resolve(world.tournament),
}));
vi.mock('../points-changed', () => ({
  pointsChanged: () => {
    world.refreshed += 1;
  },
}));
vi.mock('./throttled-write', () => ({
  throttledWrite: (_db: unknown, _input: unknown, write: () => unknown) =>
    write(),
}));
vi.mock('./confirm/request', () => ({
  requestConfirmation: (input: unknown) => {
    world.asked.push(input);
    return Promise.resolve({
      kind: 'redirect',
      to: '/admin/confirm',
      flash: null,
    });
  },
}));

const { askToChangeRole, askToDeleteUser, toggleHidden } =
  await import('./users');

const user = (
  id: string,
  username: string,
  role: Role = 'player',
): AdminUser => ({
  id: player(id),
  username,
  name: '',
  surname: '',
  email: unwrap(emailAddress(`${username}@example.lt`)),
  role,
  standing: null,
});

const BOSS = user('1', 'savininkas', 'superadmin');
const OTHER_BOSS = user('2', 'kitas', 'superadmin');
const PLAYER = user('3', 'zaidejas');

const ADMIN: SignedInPlayer = {
  player: BOSS.id,
  name: 'Jonas',
  surname: 'Petraitis',
  role: 'superadmin',
  lastTournament: null,
};

function formOf(fields: readonly (readonly [string, string])[]): FormData {
  const form = new FormData();
  for (const [name, value] of fields) form.append(name, value);
  return form;
}

const invalidSaying = (field: string, problem: string) => ({
  kind: 'redirect',
  to: '/admin/users',
  flash: { kind: 'admin-invalid', problems: [{ field, problem }] },
});

const saying = (message: string, names: object = {}) => ({
  kind: 'redirect',
  to: '/admin/users',
  flash: { kind: 'admin', message, ...names },
});

beforeEach(() => {
  world.users = [BOSS, OTHER_BOSS, PLAYER];
  world.tournament = FINISHED.tournament;
  world.hidden = { ok: true, value: { hidden: true } };
  world.asked = [];
  world.hid = [];
  world.refreshed = 0;
});

describe('asking to change a role: the form and the domain decide before any mail (R-26 amended)', () => {
  const ask = (fields: readonly (readonly [string, string])[], admin = ADMIN) =>
    askToChangeRole({ admin, form: formOf(fields) });

  it("users: a valid change asks for the code with exactly the cookie's account and role", async () => {
    expect(
      await ask([
        ['userID', '3'],
        ['admin', 'results-manager'],
      ]),
    ).toEqual({ kind: 'redirect', to: '/admin/confirm', flash: null });
    expect(world.asked).toEqual([
      {
        admin: ADMIN,
        action: {
          kind: 'change-role',
          player: PLAYER.id,
          role: 'results-manager',
        },
        back: '/admin/users',
      },
    ]);
  });

  it.each([
    [
      [
        ['userID[]', '1'],
        ['admin', 'player'],
      ],
      'userID',
      'not-an-integer',
    ],
    [
      [
        ['userID', '1.5'],
        ['admin', 'player'],
      ],
      'userID',
      'not-an-integer',
    ],
    [
      [
        ['userID', '3'],
        ['admin', 'owner'],
      ],
      'admin',
      'not-a-role',
    ],
    [[['userID', '3']], 'admin', 'required'],
  ] as const)(
    'users: a refused form (%j) is the 422 summary, mails nothing and never acts on player 1 (issue 281)',
    async (fields, field, problem) => {
      expect(await ask(fields)).toEqual(invalidSaying(field, problem));
      expect(world.asked).toEqual([]);
    },
  );

  it('users: an unknown account is a 404, mailing nothing', async () => {
    expect(
      await ask([
        ['userID', '99'],
        ['admin', 'player'],
      ]),
    ).toEqual({ kind: 'not-found' });
    expect(world.asked).toEqual([]);
  });

  it.each([
    [
      [
        ['userID', '1'],
        ['admin', 'player'],
      ],
      'own-role',
    ],
    [
      [
        ['userID', '3'],
        ['admin', 'player'],
      ],
      'same-role',
    ],
  ] as const)(
    'users: %j is refused as %s before any mail',
    async (fields, message) => {
      expect(await ask(fields)).toEqual(saying(message));
      expect(world.asked).toEqual([]);
    },
  );

  it("users: the last superadmin is refused before any mail, a role change is nobody's who is no superadmin", async () => {
    world.users = [BOSS, PLAYER];
    const lastAsOther = await askToChangeRole({
      admin: { ...ADMIN, player: PLAYER.id, role: 'superadmin' },
      form: formOf([
        ['userID', '1'],
        ['admin', 'player'],
      ]),
    });
    expect(lastAsOther).toEqual(saying('last-superadmin-role'));
    const manager = await askToChangeRole({
      admin: { ...ADMIN, role: 'results-manager' },
      form: formOf([
        ['userID', '3'],
        ['admin', 'results-manager'],
      ]),
    });
    expect(manager).toEqual({ kind: 'home' });
    expect(world.asked).toEqual([]);
  });
});

describe('asking to delete an account (R-25, R-26 amended)', () => {
  const ask = (fields: readonly (readonly [string, string])[], admin = ADMIN) =>
    askToDeleteUser({ admin, form: formOf(fields) });

  it('users: a valid delete asks for the code naming the account from the list, not the post', async () => {
    await ask([['userID', ' 3 ']]);
    expect(world.asked).toEqual([
      {
        admin: ADMIN,
        action: { kind: 'delete-user', player: PLAYER.id },
        back: '/admin/users',
      },
    ]);
  });

  it('users: userID[]=1 and a cast are refused with the summary, an unknown account is a 404', async () => {
    expect(await ask([['userID[]', '1']])).toEqual(
      invalidSaying('userID', 'not-an-integer'),
    );
    expect(await ask([['userID', 'x']])).toEqual(
      invalidSaying('userID', 'not-an-integer'),
    );
    expect(await ask([['userID', '99']])).toEqual({ kind: 'not-found' });
    expect(world.asked).toEqual([]);
  });

  it('users: yourself and the last superadmin are refused before any mail', async () => {
    expect(await ask([['userID', '1']])).toEqual(saying('own-account'));
    world.users = [BOSS, PLAYER];
    const other = await askToDeleteUser({
      admin: { ...ADMIN, player: PLAYER.id },
      form: formOf([['userID', '1']]),
    });
    expect(other).toEqual(saying('last-superadmin'));
    expect(world.asked).toEqual([]);
  });

  it('users: a role that is no superadmin goes home', async () => {
    expect(
      await askToDeleteUser({
        admin: { ...ADMIN, role: 'results-manager' },
        form: formOf([['userID', '3']]),
      }),
    ).toEqual({ kind: 'home' });
  });
});

describe('the hide (R-19, R-39, R-115)', () => {
  const toggle = (fields: readonly (readonly [string, string])[]) =>
    toggleHidden({ admin: ADMIN, form: formOf(fields) });

  it('users: toggles the account in the working tournament as the session admin, refreshes the boards and says which way', async () => {
    expect(await toggle([['userID', '3']])).toEqual(
      saying('user-hidden', { name: 'zaidejas' }),
    );
    expect(world.hid).toEqual([
      { actor: BOSS.id, tournament: FINISHED.tournament, player: PLAYER.id },
    ]);
    expect(world.refreshed).toBe(1);
    world.hidden = { ok: true, value: { hidden: false } };
    expect(await toggle([['userID', '3']])).toEqual(
      saying('user-shown', { name: 'zaidejas' }),
    );
  });

  it('users: a refused id is the summary, an unknown account a 404, no working tournament a message - nothing toggled', async () => {
    expect(await toggle([['userID[]', '3']])).toEqual(
      invalidSaying('userID', 'not-an-integer'),
    );
    expect(await toggle([['userID', '99']])).toEqual({ kind: 'not-found' });
    world.tournament = null;
    expect(await toggle([['userID', '3']])).toEqual(saying('no-tournament'));
    expect(world.hid).toEqual([]);
  });

  it('users: an account outside the tournament is refused, an actor no longer a superadmin goes home, and nothing is refreshed', async () => {
    world.hidden = { ok: false, refusal: 'not-player' };
    expect(await toggle([['userID', '3']])).toEqual(saying('not-a-player'));
    world.hidden = { ok: false, refusal: 'actor-not-superadmin' };
    expect(await toggle([['userID', '3']])).toEqual({ kind: 'home' });
    expect(world.refreshed).toBe(0);
  });
});
