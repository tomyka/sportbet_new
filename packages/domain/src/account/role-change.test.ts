import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import { ROLES, type Role } from './role';
import { roleChange, roleChangeEntry } from './role-change';

const ADA = player('1');
const BEN = player('2');
const CAI = player('3');

const decide = (over: {
  actorRole?: Role;
  targetRole?: Role;
  role?: Role;
  superadmins?: readonly (typeof ADA)[];
  actor?: typeof ADA;
  target?: typeof ADA;
}) =>
  roleChange({
    actor: { player: over.actor ?? ADA, role: over.actorRole ?? 'superadmin' },
    target: { player: over.target ?? BEN, role: over.targetRole ?? 'player' },
    role: over.role ?? 'results-manager',
    superadmins: over.superadmins ?? [ADA],
  });

describe('roleChange (R-26 amended)', () => {
  it.each(
    ROLES.flatMap((from) =>
      ROLES.filter((to) => to !== from).map((to) => [from, to] as const),
    ),
  )('a superadmin changes another account from %s to %s', (from, to) => {
    expect(
      decide({
        targetRole: from,
        role: to,
        superadmins: from === 'superadmin' ? [ADA, BEN] : [ADA],
      }),
    ).toEqual({ ok: true, value: { player: BEN, from, to } });
  });

  it.each(['results-manager', 'player'] as const)(
    'refuses an actor who is a %s, whoever the target and whatever the role',
    (actorRole) => {
      expect(decide({ actorRole })).toEqual({
        ok: false,
        refusal: 'actor-not-superadmin',
      });
    },
  );

  it('refuses a change of your own role, even to the same role or as the only superadmin', () => {
    expect(
      decide({ target: ADA, targetRole: 'superadmin', role: 'player' }),
    ).toEqual({ ok: false, refusal: 'own-role' });
    expect(
      decide({ target: ADA, targetRole: 'superadmin', role: 'superadmin' }),
    ).toEqual({ ok: false, refusal: 'own-role' });
  });

  it('refuses the same role', () => {
    expect(decide({ targetRole: 'player', role: 'player' })).toEqual({
      ok: false,
      refusal: 'same-role',
    });
  });

  it('refuses taking the role from the last superadmin, through the pure rule', () => {
    expect(
      decide({
        actor: CAI,
        target: BEN,
        targetRole: 'superadmin',
        role: 'player',
        superadmins: [BEN],
      }),
    ).toEqual({ ok: false, refusal: 'last-superadmin' });
  });

  it('lets a superadmin demote another when someone else remains', () => {
    expect(
      decide({
        targetRole: 'superadmin',
        role: 'results-manager',
        superadmins: [ADA, BEN],
      }).ok,
    ).toBe(true);
  });

  it('judges the actor before the target: a non-superadmin changing themselves is refused as not a superadmin', () => {
    expect(
      decide({
        actorRole: 'results-manager',
        target: ADA,
        targetRole: 'results-manager',
        role: 'superadmin',
      }),
    ).toEqual({ ok: false, refusal: 'actor-not-superadmin' });
  });

  it('judges own role before the same role', () => {
    expect(
      decide({ target: ADA, targetRole: 'superadmin', role: 'superadmin' }),
    ).toEqual({ ok: false, refusal: 'own-role' });
  });
});

describe('roleChangeEntry', () => {
  const entry = (admin: unknown, userID: unknown) =>
    roleChangeEntry({ admin, userID });

  it.each(ROLES)('reads the role %s and the account', (role) => {
    expect(entry(role, '2')).toEqual({
      ok: true,
      value: { target: BEN, role },
    });
  });

  it('refuses a role outside the three, sportbet levels included', () => {
    for (const admin of ['admin', '9', '5', 'Superadmin', ' player']) {
      expect(entry(admin, '2')).toEqual({
        ok: false,
        errors: [{ field: 'admin', problem: 'not-a-role' }],
      });
    }
  });

  it('refuses a missing role or account as required', () => {
    expect(entry('', '')).toEqual({
      ok: false,
      errors: [
        { field: 'admin', problem: 'required' },
        { field: 'userID', problem: 'required' },
      ],
    });
    expect(entry(undefined, null)).toEqual({
      ok: false,
      errors: [
        { field: 'admin', problem: 'required' },
        { field: 'userID', problem: 'required' },
      ],
    });
  });

  it.each(['x', '0', '01', '1.5', '-1', '2147483648'])(
    'refuses the account %j as not an integer',
    (userID) => {
      expect(entry('player', userID)).toEqual({
        ok: false,
        errors: [{ field: 'userID', problem: 'not-an-integer' }],
      });
    },
  );

  it('refuses an array account (issue 281: userID[]=x acted on user 1)', () => {
    expect(entry('player', ['1'])).toEqual({
      ok: false,
      errors: [{ field: 'userID', problem: 'not-an-integer' }],
    });
  });

  it('refuses an array role as not a role', () => {
    expect(entry(['player'], '2')).toEqual({
      ok: false,
      errors: [{ field: 'admin', problem: 'not-a-role' }],
    });
  });
});
