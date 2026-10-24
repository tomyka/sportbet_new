import type { AuditPageData } from '@sportbet/db';
import {
  AUDIT_TABS,
  type AuditPageQuery,
  type AuditTab,
} from '@sportbet/domain';
import { at } from '@sportbet/domain/testing';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { auditHref } from './audit-links';
import { selectByLabel } from './element-lookup';
import { AuditView } from './audit-view';

const QUERY: AuditPageQuery = {
  tab: 'prisijungimai',
  user: null,
  pages: {
    prisijungimai: 1,
    prognozes: 1,
    rezultatai: 1,
    roles: 1,
    islikimas: 1,
  },
};

const USERS = [
  { id: 2, username: 'savininkas' },
  { id: 5, username: 'zaidejas' },
];

const COUNTS = {
  prisijungimai: 3,
  prognozes: 12,
  rezultatai: 0,
  roles: 4,
  islikimas: 7,
};

const LOGIN_AT = at('2026-10-14T21:30:00Z');

function data(
  active: AuditPageData['active'],
  overrides: Partial<AuditPageData> = {},
): AuditPageData {
  return {
    query: { ...QUERY, tab: active.tab },
    counts: COUNTS,
    lastPage: 1,
    users: USERS,
    active,
    ...overrides,
  };
}

/** A tab with no rows. */
function emptyOf(tab: AuditTab): AuditPageData['active'] {
  switch (tab) {
    case 'prisijungimai':
      return { tab, rows: [] };
    case 'prognozes':
      return { tab, rows: [] };
    case 'rezultatai':
      return { tab, rows: [] };
    case 'roles':
      return { tab, rows: [] };
    case 'islikimas':
      return { tab, rows: [] };
  }
}

const LOGINS = data({
  tab: 'prisijungimai',
  rows: [
    { username: 'zaidejas', method: 'email_code', at: LOGIN_AT },
    { username: 'naujokas', method: 'register', at: LOGIN_AT },
    { username: 'gugelis', method: 'google', at: LOGIN_AT },
    { username: 'naujas', method: 'register_google', at: LOGIN_AT },
  ],
});

describe('AuditView (admin/audit.blade.php, R-45, R-69, R-117)', () => {
  it('audit: five tabs as links with their counts, the active one marked, each keeping the user filter', () => {
    render(<AuditView data={{ ...LOGINS, query: { ...QUERY, user: 5 } }} />);
    const tabs = within(screen.getByRole('navigation', { name: 'Auditas' }));
    const links = tabs.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Prisijungimai 3',
      'Prognozės 12',
      'Rezultatai 0',
      'Rolės 4',
      'Išlikimas 7',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/audit?user=5',
      '/admin/audit?tab=prognozes&user=5',
      '/admin/audit?tab=rezultatai&user=5',
      '/admin/audit?tab=roles&user=5',
      '/admin/audit?tab=islikimas&user=5',
    ]);
    expect(
      links.filter((link) => link.getAttribute('aria-current') === 'page'),
    ).toHaveLength(1);
    expect(links[0]?.getAttribute('aria-current')).toBe('page');
  });

  it('audit: the user filter lists every username under "- Visi vartotojai -", selects the filtered one and posts by GET, keeping the tab', () => {
    render(
      <AuditView
        data={{
          ...data({ tab: 'prognozes', rows: [] }),
          query: { ...QUERY, tab: 'prognozes', user: 5 },
        }}
      />,
    );
    const select = selectByLabel(document.body, 'Vartotojas');
    expect(select.name).toBe('user');
    expect(select.value).toBe('5');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => [option.getAttribute('value'), option.textContent]),
    ).toEqual([
      ['', '- Visi vartotojai -'],
      ['2', 'savininkas'],
      ['5', 'zaidejas'],
    ]);
    const form = select.closest('form');
    expect(form?.getAttribute('method')).toBe('get');
    expect(form?.getAttribute('action')).toBe('/admin/audit');
    expect(
      form?.querySelector<HTMLInputElement>('input[name="tab"]')?.value,
    ).toBe('prognozes');
    expect(
      screen
        .getByRole('link', { name: 'Visi vartotojai' })
        .getAttribute('href'),
    ).toBe('/admin/audit?tab=prognozes');
  });

  it('audit: changing the filter submits it, and no clear link shows without one', () => {
    render(<AuditView data={LOGINS} />);
    expect(screen.queryByRole('link', { name: 'Visi vartotojai' })).toBeNull();
    const select = screen.getByLabelText('Vartotojas');
    const form = select.closest('form');
    const submit = vi.fn();
    if (form === null) throw new Error('no form');
    form.requestSubmit = submit;
    fireEvent.change(select, { target: { value: '2' } });
    expect(submit).toHaveBeenCalledOnce();
  });

  it('audit: sign-ins show username, the method in words and the Vilnius date and time, with no IP column (R-45)', () => {
    render(<AuditView data={LOGINS} />);
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual(['Vartotojas', 'Metodas', 'Data']);
    const rows = screen.getAllByTestId('audit-row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'zaidejasEl. paštas2026-10-15 00:30',
      'naujokasRegistracija2026-10-15 00:30',
      'gugelisGoogle2026-10-15 00:30',
      'naujasRegistracija (Google)2026-10-15 00:30',
    ]);
    expect(screen.queryByText('IP adresas')).toBeNull();
  });

  it('audit: an empty tab says so in its own words', () => {
    const empty: Record<AuditTab, string> = {
      prisijungimai: 'Prisijungimų įrašų nėra.',
      prognozes: 'Prognozių pakeitimų nėra.',
      rezultatai: 'Rezultatų pakeitimų nėra.',
      roles: 'Rolių pakeitimų nėra.',
      islikimas: 'Išlikimo pasirinkimų nėra.',
    };
    for (const tab of AUDIT_TABS) {
      const { unmount } = render(<AuditView data={data(emptyOf(tab))} />);
      expect(screen.getByText(empty[tab])).toBeTruthy();
      unmount();
    }
  });

  it('audit: prediction changes show the game, the old pair or a dash, an arrow and the new pair', () => {
    render(
      <AuditView
        data={data({
          tab: 'prognozes',
          rows: [
            {
              username: 'zaidejas',
              home: 'Žalgiris',
              away: 'Real',
              old: { home: 80, away: 75 },
              new: { home: 82, away: 70 },
              at: LOGIN_AT,
            },
            {
              username: 'naujokas',
              home: 'Olympiacos',
              away: 'Fenerbahce',
              old: null,
              new: { home: 90, away: 88 },
              at: LOGIN_AT,
            },
          ],
        })}
      />,
    );
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual(['Vartotojas', 'Rungtynės', 'Sena', '', 'Nauja', 'Data']);
    expect(
      screen.getAllByTestId('audit-row').map((row) => row.textContent),
    ).toEqual([
      'zaidejasŽalgiris - Real80:75→82:702026-10-15 00:30',
      'naujokasOlympiacos - Fenerbahce-→90:882026-10-15 00:30',
    ]);
  });

  it('audit: a result change shows a postponed side as Atidėta, no result as a dash, and a forgotten actor as a dash (R-69)', () => {
    render(
      <AuditView
        data={data({
          tab: 'rezultatai',
          rows: [
            {
              username: null,
              home: 'Žalgiris',
              away: 'Real',
              old: { kind: 'none' },
              new: { kind: 'postponed' },
              at: LOGIN_AT,
            },
            {
              username: 'savininkas',
              home: 'Žalgiris',
              away: 'Real',
              old: { kind: 'postponed' },
              new: { kind: 'score', home: 85, away: 80 },
              at: LOGIN_AT,
            },
          ],
        })}
      />,
    );
    expect(
      screen.getAllByTestId('audit-row').map((row) => row.textContent),
    ).toEqual([
      '-Žalgiris - Real-→Atidėta2026-10-15 00:30',
      'savininkasŽalgiris - RealAtidėta→85:802026-10-15 00:30',
    ]);
  });

  it('audit: the survival tab shows the round, the card replaced or a dash, an arrow and the card now (R-140)', () => {
    render(
      <AuditView
        data={data({
          tab: 'islikimas',
          rows: [
            {
              username: 'zaidejas',
              round: 4,
              team: 'Žalgiris',
              oldTeam: 'Real',
              at: LOGIN_AT,
            },
            {
              username: 'savininkas',
              round: 1,
              team: 'Barcelona',
              oldTeam: null,
              at: LOGIN_AT,
            },
          ],
        })}
      />,
    );
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual(['Vartotojas', 'Turas', 'Sena', '', 'Nauja', 'Data']);
    expect(
      screen.getAllByTestId('audit-row').map((row) => row.textContent),
    ).toEqual([
      'zaidejas4Real→Žalgiris2026-10-15 00:30',
      'savininkas1-→Barcelona2026-10-15 00:30',
    ]);
  });

  it('audit: the roles tab says who did what to whom, the roles in words, and a forgotten account as a dash (R-117)', () => {
    render(
      <AuditView
        data={data({
          tab: 'roles',
          rows: [
            {
              actor: 'savininkas',
              target: 'zaidejas',
              kind: 'role_change',
              oldRole: 'player',
              newRole: 'results-manager',
              at: LOGIN_AT,
            },
            {
              actor: null,
              target: null,
              kind: 'account_deletion',
              oldRole: 'superadmin',
              newRole: null,
              at: LOGIN_AT,
            },
          ],
        })}
      />,
    );
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual([
      'Atliko',
      'Veiksmas',
      'Vartotojas',
      'Sena rolė',
      '',
      'Nauja rolė',
      'Data',
    ]);
    expect(
      screen.getAllByTestId('audit-row').map((row) => row.textContent),
    ).toEqual([
      'savininkasRolės keitimaszaidejasŽaidėjas→Rezultatų tvarkytojas2026-10-15 00:30',
      '-Paskyros ištrynimas-Superadministratorius→-2026-10-15 00:30',
    ]);
  });

  it("audit: a tab of one page has no pager; a longer one has its own, keeping the user and the other tabs' pages", () => {
    const { unmount } = render(<AuditView data={LOGINS} />);
    expect(screen.queryByRole('navigation', { name: 'Puslapiai' })).toBeNull();
    unmount();
    render(
      <AuditView
        data={{
          ...LOGINS,
          lastPage: 4,
          query: {
            ...QUERY,
            user: 5,
            pages: { ...QUERY.pages, prisijungimai: 2, prognozes: 3 },
          },
        }}
      />,
    );
    const pager = within(screen.getByRole('navigation', { name: 'Puslapiai' }));
    expect(pager.getByText('2 / 4')).toBeTruthy();
    expect(
      pager.getByRole('link', { name: 'Ankstesnis' }).getAttribute('href'),
    ).toBe('/admin/audit?user=5&predictions_page=3');
    expect(
      pager.getByRole('link', { name: 'Kitas' }).getAttribute('href'),
    ).toBe('/admin/audit?user=5&logins_page=3&predictions_page=3');
  });

  it('audit: the first page has no previous link and the last no next', () => {
    const { unmount } = render(<AuditView data={{ ...LOGINS, lastPage: 3 }} />);
    expect(screen.queryByRole('link', { name: 'Ankstesnis' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Kitas' })).toBeTruthy();
    unmount();
    render(
      <AuditView
        data={{
          ...LOGINS,
          lastPage: 3,
          query: { ...QUERY, pages: { ...QUERY.pages, prisijungimai: 3 } },
        }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Ankstesnis' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Kitas' })).toBeNull();
  });
});

describe('auditHref', () => {
  it('audit: the plain sign-ins page of nobody is the bare path', () => {
    expect(auditHref(QUERY, {})).toBe('/admin/audit');
  });

  it('audit: a tab, a user and a page above 1 are named, a page of 1 and the sign-ins tab are not', () => {
    expect(
      auditHref(
        { ...QUERY, user: 5, pages: { ...QUERY.pages, roles: 2 } },
        { tab: 'roles' },
      ),
    ).toBe('/admin/audit?tab=roles&user=5&roles_page=2');
    expect(
      auditHref(
        { ...QUERY, pages: { ...QUERY.pages, islikimas: 3 } },
        { tab: 'islikimas' },
      ),
    ).toBe('/admin/audit?tab=islikimas&survival_page=3');
    expect(auditHref(QUERY, { user: null, pages: { prognozes: 1 } })).toBe(
      '/admin/audit',
    );
  });
});
