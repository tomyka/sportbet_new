import { describe, expect, it } from 'vitest';
import {
  isAdmin,
  mayEnterResults,
  mayRecalculate,
  ROLES,
  roleOfSportbetLevel,
  type Role,
} from './role';

describe('roles (R-26 amended)', () => {
  it('role: three, in order of rights', () => {
    expect(ROLES).toEqual(['player', 'results-manager', 'superadmin']);
  });

  it.each([
    [0, 'player'],
    [1, 'results-manager'],
    [5, 'results-manager'],
    [7, 'results-manager'],
    [8, 'superadmin'],
    [9, 'superadmin'],
    [127, 'superadmin'],
  ] as const)("role: sportbet's level %i is a %s", (level, role) => {
    expect(roleOfSportbetLevel(level)).toEqual({ ok: true, value: role });
  });

  it.each([-1, 128, 1.5])(
    'role: %s is not a level sportbet stores',
    (level) => {
      expect(roleOfSportbetLevel(level)).toEqual({
        ok: false,
        refusal: 'bad-admin-level',
      });
    },
  );

  it.each([
    ['player', false],
    ['results-manager', true],
    ['superadmin', true],
  ] as const satisfies readonly (readonly [Role, boolean])[])(
    'role: a %s is an admin, enters results and recalculates: %s',
    (role, admin) => {
      expect(isAdmin(role)).toBe(admin);
      expect(mayEnterResults(role)).toBe(admin);
      expect(mayRecalculate(role)).toBe(admin);
    },
  );
});
