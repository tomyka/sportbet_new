import { describe, expect, it } from 'vitest';
import {
  AUDIT_ADMIN_KINDS,
  AUDIT_PAGE_PARAMS,
  AUDIT_PAGE_SIZE,
  AUDIT_TABS,
  auditAdminRowSchema,
  auditLastPage,
  auditLoginRowSchema,
  auditPageQuery,
  auditPredictionRowSchema,
  auditResultRowSchema,
} from './audit-page';

describe('AUDIT_TABS', () => {
  it('audit: four tabs, sign-ins first', () => {
    expect(AUDIT_TABS).toEqual([
      'prisijungimai',
      'prognozes',
      'rezultatai',
      'roles',
    ]);
  });

  it('audit: each tab has its own page parameter', () => {
    expect(AUDIT_PAGE_PARAMS).toEqual({
      prisijungimai: 'logins_page',
      prognozes: 'predictions_page',
      rezultatai: 'results_page',
      roles: 'roles_page',
    });
    expect(AUDIT_PAGE_SIZE).toBe(25);
  });
});

describe('auditPageQuery', () => {
  const firstPages = {
    prisijungimai: 1,
    prognozes: 1,
    rezultatai: 1,
    roles: 1,
  };

  it('audit: no parameters is the sign-ins, everyone, the first pages', () => {
    expect(auditPageQuery({})).toEqual({
      tab: 'prisijungimai',
      user: null,
      pages: firstPages,
    });
  });

  it.each(['prisijungimai', 'prognozes', 'rezultatai', 'roles'])(
    'audit: reads the tab %s',
    (tab) => {
      expect(auditPageQuery({ tab }).tab).toBe(tab);
    },
  );

  it.each([['nezinoma'], [''], ['ROLES'], ['__proto__'], ['constructor']])(
    'audit: the unknown tab %j is the sign-ins',
    (tab) => {
      expect(auditPageQuery({ tab }).tab).toBe('prisijungimai');
    },
  );

  it('audit: an array tab is the sign-ins', () => {
    expect(auditPageQuery({ tab: ['roles', 'prognozes'] }).tab).toBe(
      'prisijungimai',
    );
  });

  it('audit: reads each tab its own page', () => {
    expect(
      auditPageQuery({
        logins_page: '2',
        predictions_page: '3',
        results_page: '4',
        roles_page: '5',
      }).pages,
    ).toEqual({ prisijungimai: 2, prognozes: 3, rezultatai: 4, roles: 5 });
  });

  it.each([['0'], ['-1'], ['abc'], ['1.5'], ['02'], [''], ['2147483648']])(
    'audit: the page %j is page 1',
    (page) => {
      expect(auditPageQuery({ logins_page: page }).pages.prisijungimai).toBe(1);
    },
  );

  it('audit: an array page is page 1', () => {
    expect(auditPageQuery({ results_page: ['3', '4'] }).pages.rezultatai).toBe(
      1,
    );
  });

  it('audit: the user filter is read only as an id', () => {
    expect(auditPageQuery({ user: '12' }).user).toBe(12);
  });

  it.each([['0'], ['-3'], ['12abc'], ['1e3'], [''], ['2147483648'], [' 12']])(
    'audit: the user %j filters nobody',
    (user) => {
      expect(auditPageQuery({ user }).user).toBeNull();
    },
  );

  it('audit: an array user filters nobody (issue 281)', () => {
    expect(auditPageQuery({ user: ['1', '2'] }).user).toBeNull();
    expect(auditPageQuery({ user: ['1'] }).user).toBeNull();
  });
});

describe('auditLastPage', () => {
  it('audit: an empty tab still has a first page', () => {
    expect(auditLastPage(0)).toBe(1);
  });

  it('audit: 25 rows are one page, 26 are two', () => {
    expect(auditLastPage(25)).toBe(1);
    expect(auditLastPage(26)).toBe(2);
    expect(auditLastPage(100)).toBe(4);
  });
});

describe('the audit row schemas', () => {
  const at = 1_760_000_000_000;

  it('audit: a sign-in row names the method as the app stores it, no IP', () => {
    expect(
      auditLoginRowSchema.parse({ username: 'ada', method: 'register', at }),
    ).toEqual({ username: 'ada', method: 'register', at });
    for (const method of ['google', 'register_google']) {
      expect(
        auditLoginRowSchema.safeParse({ username: 'ada', method, at }).success,
      ).toBe(true);
    }
    expect(
      auditLoginRowSchema.safeParse({ username: 'ada', method: 'facebook', at })
        .success,
    ).toBe(false);
  });

  it('audit: a prediction row carries the old pair or none', () => {
    const row = {
      username: 'ada',
      home: 'Real',
      away: 'Fenerbahce',
      oldHome: null,
      oldAway: null,
      newHome: 80,
      newAway: 70,
      at,
    };
    expect(auditPredictionRowSchema.parse(row)).toEqual({
      username: 'ada',
      home: 'Real',
      away: 'Fenerbahce',
      old: null,
      new: { home: 80, away: 70 },
      at,
    });
    expect(
      auditPredictionRowSchema.parse({ ...row, oldHome: 1, oldAway: 2 }).old,
    ).toEqual({ home: 1, away: 2 });
    expect(
      auditPredictionRowSchema.safeParse({ ...row, newHome: -1 }).success,
    ).toBe(false);
  });

  it('audit: a result row reads each side as a score, postponed or none', () => {
    const row = {
      username: 'ben',
      home: 'Real',
      away: 'Fenerbahce',
      oldHome: null,
      oldAway: null,
      oldPostponed: false,
      newHome: 88,
      newAway: 79,
      newPostponed: false,
      at,
    };
    expect(auditResultRowSchema.parse(row)).toMatchObject({
      username: 'ben',
      old: { kind: 'none' },
      new: { kind: 'score', home: 88, away: 79 },
    });
    expect(
      auditResultRowSchema.parse({
        ...row,
        oldHome: 88,
        oldAway: 79,
        newHome: null,
        newAway: null,
        newPostponed: true,
      }),
    ).toMatchObject({
      old: { kind: 'score', home: 88, away: 79 },
      new: { kind: 'postponed' },
    });
  });

  it('audit: a result row keeps a forgotten actor as null (R-69)', () => {
    expect(
      auditResultRowSchema.parse({
        username: null,
        home: 'A',
        away: 'B',
        oldHome: null,
        oldAway: null,
        oldPostponed: false,
        newHome: 1,
        newAway: 2,
        newPostponed: false,
        at,
      }).username,
    ).toBeNull();
  });

  it('audit: a result row refuses a half score', () => {
    expect(
      auditResultRowSchema.safeParse({
        username: 'ben',
        home: 'A',
        away: 'B',
        oldHome: 1,
        oldAway: null,
        oldPostponed: false,
        newHome: 1,
        newAway: 2,
        newPostponed: false,
        at,
      }).success,
    ).toBe(false);
  });

  it('audit: the admin trail has two kinds, and a forgotten party is null (R-117)', () => {
    expect(AUDIT_ADMIN_KINDS).toEqual(['role_change', 'account_deletion']);
    expect(
      auditAdminRowSchema.parse({
        actor: null,
        target: 'ben',
        kind: 'role_change',
        oldRole: 'player',
        newRole: 'superadmin',
        at,
      }),
    ).toEqual({
      actor: null,
      target: 'ben',
      kind: 'role_change',
      oldRole: 'player',
      newRole: 'superadmin',
      at,
    });
    expect(
      auditAdminRowSchema.parse({
        actor: 'ada',
        target: null,
        kind: 'account_deletion',
        oldRole: 'player',
        newRole: null,
        at,
      }).kind,
    ).toBe('account_deletion');
    expect(
      auditAdminRowSchema.safeParse({
        actor: 'ada',
        target: null,
        kind: 'something-else',
        oldRole: null,
        newRole: null,
        at,
      }).success,
    ).toBe(false);
  });
});
