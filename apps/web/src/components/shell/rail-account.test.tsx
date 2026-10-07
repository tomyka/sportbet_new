import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { JONAS } from '../../../tests/support/shell-views';
import { RailAccount } from './rail-account';
import { SHELL_LINKS, SPORTBET_LINKS } from './shell-paths';

// sportbet's RailNavigationTest, the account footer (issue 135): a labelled
// section of plain links, its own sign-out form, admin only for an admin.

it("is a labelled section with the player's profile, under their initials", () => {
  render(<RailAccount player={JONAS} links={SPORTBET_LINKS} />);
  expect(screen.getByText('Paskyra')).toBeDefined();
  const profile = screen.getByRole('link', { name: 'Profilis: Jonas P.' });
  expect(profile.getAttribute('href')).toBe('/userProfile');
  expect(profile.textContent).toContain('JP');
});

it('signs out through its own form', () => {
  render(<RailAccount player={JONAS} links={SPORTBET_LINKS} />);
  const signOut = screen.getByRole('button', { name: 'Atsijungti' });
  expect(signOut.getAttribute('type')).toBe('submit');
  expect(signOut.getAttribute('form')).toBe('logout-form-rail');
  const form = document.getElementById('logout-form-rail');
  expect(form?.getAttribute('action')).toBe('/logout');
  expect(form?.getAttribute('method')).toBe('post');
});

it('offers administration to an admin only', () => {
  const { unmount } = render(
    <RailAccount player={JONAS} links={SPORTBET_LINKS} />,
  );
  expect(screen.queryByRole('link', { name: 'Administravimas' })).toBeNull();
  unmount();

  render(
    <RailAccount player={{ ...JONAS, isAdmin: true }} links={SPORTBET_LINKS} />,
  );
  expect(
    screen.getByRole('link', { name: 'Administravimas' }).getAttribute('href'),
  ).toBe('/admin/index');
});

it('shows the name and initials without a link while the profile does not exist, and an admin administration since slice 7', () => {
  render(
    <RailAccount player={{ ...JONAS, isAdmin: true }} links={SHELL_LINKS} />,
  );
  expect(screen.getByText('Jonas P.')).toBeDefined();
  expect(screen.getByText('JP')).toBeDefined();
  expect(
    screen.getAllByRole('link').map((link) => link.getAttribute('href')),
  ).toEqual(['/admin/index']);
  expect(screen.getByRole('button', { name: 'Atsijungti' })).toBeDefined();
});
