import type { AdminUser } from '@sportbet/db';
import { emailAddress } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { flashSchema, type Flash } from '../../server/flash';
import { selectByLabel } from './element-lookup';
import { UsersView } from './users-view';
import { FINISHED } from './tournament-fixtures';

const user = (
  id: string,
  username: string,
  overrides: Partial<AdminUser> = {},
): AdminUser => ({
  id: player(id),
  username,
  name: 'Jonas',
  surname: 'Petraitis',
  email: unwrap(emailAddress(`${username}@example.lt`)),
  role: 'player',
  standing: { adminHidden: false, switchedOff: false },
  ...overrides,
});

const BOSS = user('1', 'savininkas', { role: 'superadmin' });
const PLAYING = user('2', 'zaidejas');
const HIDDEN = user('3', 'paslėptas', {
  standing: { adminHidden: true, switchedOff: false },
});
const OFF = user('4', 'isjungtas', {
  standing: { adminHidden: false, switchedOff: true },
});
const ELSEWHERE = user('5', 'kitur', { standing: null });
const NO_NAME = user('6', 'be-vardo', { name: '', surname: '' });

const USERS = [BOSS, PLAYING, HIDDEN, OFF, ELSEWHERE, NO_NAME];

const view = (
  users: readonly AdminUser[] = USERS,
  flash: Flash | null = null,
) =>
  render(
    <UsersView
      users={users}
      viewer={BOSS.id}
      tournament={FINISHED.tournament}
      flash={flash}
    />,
  );

const rowOf = (username: string): HTMLElement => {
  const row = screen
    .getAllByTestId('user-row')
    .find((each) => within(each).queryByText(username) !== null);
  if (row === undefined) throw new Error(`no row for ${username}`);
  return row;
};

describe('UsersView (admin/users.blade.php, R-26 amended, R-19)', () => {
  it('users: titles the page with the count and lists the columns, with no Auth column (R-45: no Google)', () => {
    view();
    expect(screen.getByRole('heading', { name: /Vartotojai/ })).toBeTruthy();
    expect(screen.getByTestId('user-count').textContent).toBe('6');
    const headers = screen
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['#', 'Vartotojas', 'El. paštas', 'Admin', '']);
    expect(headers).not.toContain('Auth');
  });

  it('users: a row shows the number, the username, the full name when there is one, and the address', () => {
    view();
    const row = rowOf('zaidejas');
    expect(within(row).getByText('2')).toBeTruthy();
    expect(within(row).getByText('Jonas Petraitis')).toBeTruthy();
    expect(within(row).getByText('zaidejas@example.lt')).toBeTruthy();
    expect(within(rowOf('be-vardo')).queryByText('Jonas Petraitis')).toBeNull();
  });

  it('users: the neaktyvus badge marks an account the admin hid, titled as sportbet titled it, and a switched-off account is marked apart', () => {
    view();
    const badge = within(rowOf('paslėptas')).getByText('neaktyvus');
    expect(badge.getAttribute('title')).toBe(
      'Neaktyvus - paslėptas nuo lentelių',
    );
    expect(within(rowOf('zaidejas')).queryByText('neaktyvus')).toBeNull();
    expect(within(rowOf('isjungtas')).getByText('išjungtas')).toBeTruthy();
    expect(within(rowOf('paslėptas')).queryByText('išjungtas')).toBeNull();
  });

  it("users: the role select offers the three roles in Lithuanian, the account's own selected, and posts the account", () => {
    view([BOSS, PLAYING]);
    const select = selectByLabel(rowOf('zaidejas'), 'Rolė: zaidejas');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => [option.getAttribute('value'), option.textContent]),
    ).toEqual([
      ['player', 'Žaidėjas'],
      ['results-manager', 'Rezultatų tvarkytojas'],
      ['superadmin', 'Superadministratorius'],
    ]);
    expect(select.value).toBe('player');
    const form = select.closest('form');
    expect(form?.getAttribute('action')).toBe('/admin/updateUser');
    expect(form?.getAttribute('method')).toBe('post');
    expect(
      form?.querySelector<HTMLInputElement>('input[name="userID"]')?.value,
    ).toBe('2');
    expect(select.name).toBe('admin');
  });

  it('users: changing the select posts its form (the code is asked on the next page)', () => {
    view([BOSS, PLAYING]);
    const select = within(rowOf('zaidejas')).getByRole('combobox');
    const form = select.closest('form');
    const submit = vi.fn();
    if (form === null) throw new Error('no form');
    form.requestSubmit = submit;
    fireEvent.change(select, { target: { value: 'superadmin' } });
    expect(submit).toHaveBeenCalledOnce();
  });

  it('users: nobody changes their own role or deletes their own account here', () => {
    view();
    const own = rowOf('savininkas');
    expect(within(own).getByRole('combobox').hasAttribute('disabled')).toBe(
      true,
    );
    expect(within(own).queryByRole('button', { name: 'Ištrinti' })).toBeNull();
    expect(
      within(own).queryByRole('button', { name: /vartotoją/ }),
    ).not.toBeNull();
  });

  it('users: Ištrinti asks first and posts the account to the deletion that asks for a code', () => {
    view([BOSS, PLAYING]);
    const row = rowOf('zaidejas');
    const button = within(row).getByRole('button', { name: 'Ištrinti' });
    expect(button.closest('form')?.getAttribute('action')).toBe(
      '/admin/deleteUser',
    );
    expect(
      button
        .closest('form')
        ?.querySelector<HTMLInputElement>('input[name="userID"]')?.value,
    ).toBe('2');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(fireEvent.click(button)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Ištrinti zaidejas?');
    confirm.mockRestore();
  });

  it("users: a hide button only for an account that plays the admin's tournament, its title saying what it does next", () => {
    view();
    expect(
      within(rowOf('zaidejas')).getByRole('button', {
        name: 'Deaktyvuoti vartotoją',
      }),
    ).toBeTruthy();
    expect(
      within(rowOf('paslėptas')).getByRole('button', {
        name: 'Aktyvuoti vartotoją',
      }),
    ).toBeTruthy();
    expect(
      within(rowOf('kitur')).queryByRole('button', { name: /vartotoją/ }),
    ).toBeNull();
    const form = within(rowOf('zaidejas'))
      .getByRole('button', { name: 'Deaktyvuoti vartotoją' })
      .closest('form');
    expect(form?.getAttribute('action')).toBe('/admin/toggleHidden');
  });

  it("users: Auditas links to the account's trail", () => {
    view([BOSS, PLAYING]);
    expect(
      within(rowOf('zaidejas'))
        .getByRole('link', { name: 'Auditas' })
        .getAttribute('href'),
    ).toBe('/admin/audit?user=2');
  });

  it('users: says which tournament the hide is for, or that none is chosen and no hide is offered', () => {
    const { unmount } = view();
    expect(screen.getByRole('note').textContent).toContain(
      FINISHED.tournament.name,
    );
    unmount();
    render(
      <UsersView
        users={[BOSS, PLAYING]}
        viewer={BOSS.id}
        tournament={null}
        flash={null}
      />,
    );
    expect(screen.getByRole('note').textContent).toContain(
      'Nepasirinktas turnyras.',
    );
  });

  it('users: shows the one-time message above the table', () => {
    view(USERS, flashSchema.parse({ kind: 'admin', message: 'own-role' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'Savo rolės keisti negalima.',
    );
  });
});
