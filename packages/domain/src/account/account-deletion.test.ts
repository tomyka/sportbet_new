import { describe, expect, it } from 'vitest';
import type { LeagueMember } from '../league/league';
import { at, leagueNo, player, tournamentKey } from '../testing';
import {
  accountDeletion,
  adminHideChange,
  leagueHandOvers,
} from './account-deletion';
import type { Role } from './role';

const ADA = player('1');
const BEN = player('2');
const CAI = player('3');
const DOV = player('10');

const holder = (who: typeof ADA, role: Role) => ({ player: who, role });

describe('accountDeletion (R-25, R-26 amended)', () => {
  it('lets a superadmin delete another account', () => {
    expect(
      accountDeletion({
        actor: { admin: holder(ADA, 'superadmin') },
        target: holder(BEN, 'player'),
        superadmins: [ADA],
      }),
    ).toEqual({ ok: true, value: { player: BEN } });
  });

  it('lets a superadmin delete another superadmin', () => {
    expect(
      accountDeletion({
        actor: { admin: holder(ADA, 'superadmin') },
        target: holder(BEN, 'superadmin'),
        superadmins: [ADA, BEN],
      }).ok,
    ).toBe(true);
  });

  it.each(['player', 'results-manager'] as const)(
    'refuses an admin actor who is a %s now',
    (role) => {
      expect(
        accountDeletion({
          actor: { admin: holder(ADA, role) },
          target: holder(BEN, 'player'),
          superadmins: [],
        }),
      ).toEqual({ ok: false, refusal: 'actor-not-superadmin' });
    },
  );

  it('refuses an admin deleting their own account', () => {
    expect(
      accountDeletion({
        actor: { admin: holder(ADA, 'superadmin') },
        target: holder(ADA, 'superadmin'),
        superadmins: [ADA, BEN],
      }),
    ).toEqual({ ok: false, refusal: 'own-account' });
  });

  it('refuses the last superadmin, through the pure rule', () => {
    expect(
      accountDeletion({
        actor: { admin: holder(ADA, 'superadmin') },
        target: holder(BEN, 'superadmin'),
        superadmins: [BEN],
      }),
    ).toEqual({ ok: false, refusal: 'last-superadmin' });
  });

  describe("under 'self'", () => {
    it('lets a player delete their own account', () => {
      expect(
        accountDeletion({
          actor: 'self',
          target: holder(BEN, 'player'),
          superadmins: [ADA],
        }),
      ).toEqual({ ok: true, value: { player: BEN } });
    });

    it('refuses the last superadmin', () => {
      expect(
        accountDeletion({
          actor: 'self',
          target: holder(ADA, 'superadmin'),
          superadmins: [ADA],
        }),
      ).toEqual({ ok: false, refusal: 'last-superadmin' });
    });

    it('lets a superadmin go when another remains', () => {
      expect(
        accountDeletion({
          actor: 'self',
          target: holder(ADA, 'superadmin'),
          superadmins: [ADA, BEN],
        }).ok,
      ).toBe(true);
    });

    it('lets a results manager go even when no superadmin is listed', () => {
      expect(
        accountDeletion({
          actor: 'self',
          target: holder(CAI, 'results-manager'),
          superadmins: [],
        }).ok,
      ).toBe(true);
    });
  });
});

const member = (
  id: number,
  who: typeof ADA,
  over: Partial<LeagueMember> = {},
): Pick<LeagueMember, 'id' | 'player' | 'isGuest' | 'joinedAt'> => ({
  id,
  player: who,
  isGuest: false,
  joinedAt: at('2026-01-01T10:00:00Z'),
  ...over,
});

const L1 = leagueNo(1);
const L2 = leagueNo(2);

describe('leagueHandOvers (R-25, R-112, R-113)', () => {
  it('passes a league to the longest-standing other member', () => {
    expect(
      leagueHandOvers([
        {
          league: L1,
          others: [
            member(5, BEN, { joinedAt: at('2026-03-01T10:00:00Z') }),
            member(6, CAI, { joinedAt: at('2026-02-01T10:00:00Z') }),
          ],
        },
      ]),
    ).toEqual([{ league: L1, newOwner: CAI }]);
  });

  it('breaks a tie by the membership row id, not the player id', () => {
    expect(
      leagueHandOvers([
        { league: L1, others: [member(5, DOV), member(6, BEN)] },
      ]),
    ).toEqual([{ league: L1, newOwner: DOV }]);
  });

  it('breaks a tie at the same instant by the lower membership id, whatever order they come in', () => {
    const same = at('2026-04-01T10:00:00Z');
    const ids = (order: readonly number[]) =>
      leagueHandOvers([
        {
          league: L1,
          others: order.map((id) =>
            member(id, player(String(id + 20)), { joinedAt: same }),
          ),
        },
      ]);
    expect(ids([9, 7, 8])).toEqual([{ league: L1, newOwner: player('27') }]);
    expect(ids([7, 8, 9])).toEqual([{ league: L1, newOwner: player('27') }]);
  });

  it('counts a member with no recorded join date as the newest', () => {
    expect(
      leagueHandOvers([
        {
          league: L1,
          others: [member(5, BEN, { joinedAt: null }), member(6, CAI)],
        },
      ]),
    ).toEqual([{ league: L1, newOwner: CAI }]);
  });

  it('prefers a full member over a guest who has been there longer (R-113)', () => {
    expect(
      leagueHandOvers([
        {
          league: L1,
          others: [
            member(5, BEN, {
              isGuest: true,
              joinedAt: at('2025-01-01T10:00:00Z'),
            }),
            member(6, CAI, { joinedAt: at('2026-06-01T10:00:00Z') }),
          ],
        },
      ]),
    ).toEqual([{ league: L1, newOwner: CAI }]);
  });

  it('lets a guest inherit only when no full member is left (R-113)', () => {
    expect(
      leagueHandOvers([
        {
          league: L1,
          others: [
            member(5, DOV, { isGuest: true }),
            member(6, BEN, { isGuest: true }),
          ],
        },
      ]),
    ).toEqual([{ league: L1, newOwner: DOV }]);
  });

  it('deletes a league with no other member (R-112)', () => {
    expect(leagueHandOvers([{ league: L1, others: [] }])).toEqual([
      { league: L1, deleteEmpty: true },
    ]);
  });

  it('plans every owned league, in the order given', () => {
    expect(
      leagueHandOvers([
        { league: L2, others: [] },
        { league: L1, others: [member(5, BEN)] },
      ]),
    ).toEqual([
      { league: L2, deleteEmpty: true },
      { league: L1, newOwner: BEN },
    ]);
  });

  it('plans nothing for an account that owns no league', () => {
    expect(leagueHandOvers([])).toEqual([]);
  });

  it('does not reorder the members it is handed', () => {
    const others = [member(5, DOV), member(6, BEN)];
    leagueHandOvers([{ league: L1, others }]);
    expect(others.map(({ player: who }) => who)).toEqual([DOV, BEN]);
  });
});

describe('adminHideChange (R-19, R-39)', () => {
  const row = {
    tournament: tournamentKey('3'),
    switchedOff: false,
    adminHidden: false,
    fillIns: 4,
  };

  it('hides without touching the switch-off or the fill-in count', () => {
    expect(adminHideChange(row, true)).toEqual({ ...row, adminHidden: true });
  });

  it('un-hides and leaves a switched-off player switched off', () => {
    const off = { ...row, switchedOff: true, adminHidden: true };
    expect(adminHideChange(off, false)).toEqual({
      ...off,
      adminHidden: false,
      switchedOff: true,
    });
  });

  it('hides a switched-off player and leaves the switch-off', () => {
    expect(adminHideChange({ ...row, switchedOff: true }, true)).toEqual({
      ...row,
      switchedOff: true,
      adminHidden: true,
    });
  });
});
