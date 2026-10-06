import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JONAS, playerView } from '../../../tests/support/shell-views';
import type { NavEntry } from './nav-entries';
import { PhoneHeader } from './phone-header';
import { SHELL_LINKS, SPORTBET_LINKS, type ShellLinks } from './shell-paths';
import { guestView, type ShellView } from './shell-view';

// sportbet's partials/header: a guest's pills, or a player's menu panel
// with the tournament card and the same blocks as the rail, under the
// menu's own labels.

const PILL: NavEntry = {
  label: 'Jaunimo linija',
  href: '/charity',
  icon: 'globe2',
  audience: 'guest',
  group: 'info',
  surfaces: ['pills'],
};

const menuEntry = (
  label: string,
  href: string,
  group: NavEntry['group'],
  badge?: NavEntry['badge'],
): NavEntry => ({
  label,
  href,
  icon: 'trophy',
  audience: 'player',
  group,
  surfaces: ['menu'],
  ...(badge === undefined ? {} : { badge }),
});

const MENU: readonly NavEntry[] = [
  menuEntry('Rungtynių spėjimai', '/results', 'main', 'results'),
  menuEntry('Prognozės', '/summary/results', 'summary'),
  menuEntry('Taisyklės', '/rules', 'info'),
];

function openMenu(
  view: ShellView = playerView(),
  links: ShellLinks = SPORTBET_LINKS,
) {
  const rendered = render(
    <PhoneHeader view={view} entries={MENU} links={links} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Atidaryti meniu' }));
  return rendered;
}

describe("a guest's phone bar", () => {
  it('carries the brand, leading to the tournaments', () => {
    render(<PhoneHeader view={guestView()} entries={[]} />);
    const bar = screen.getByTestId('phone-header');
    expect(
      within(bar)
        .getByRole('img', { name: 'SportBet' })
        .closest('a')
        ?.getAttribute('href'),
    ).toBe('/');
  });

  it('carries its pills, named even where the label is hidden', () => {
    render(<PhoneHeader view={guestView()} entries={[PILL]} />);
    expect(
      screen.getByRole('link', { name: 'Jaunimo linija' }).getAttribute('href'),
    ).toBe('/charity');
  });

  it('offers "Prisijungti", named where its label is hidden', () => {
    render(<PhoneHeader view={guestView()} entries={[PILL]} />);
    expect(
      screen.getByRole('link', { name: 'Prisijungti' }).getAttribute('href'),
    ).toBe('/login');
  });

  it('has no menu', () => {
    render(<PhoneHeader view={guestView()} entries={[PILL]} />);
    expect(
      screen.queryByRole('button', { name: 'Atidaryti meniu' }),
    ).toBeNull();
  });
});

describe("a player's phone bar", () => {
  it('opens a menu with the tournament card', () => {
    openMenu();
    expect(screen.getByText('Eurolyga 2026-27')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Keisti turnyrą' }).getAttribute('href'),
    ).toBe('/tournaments/exit');
  });

  it("lists the entries under the menu's labels, and no empty block", () => {
    openMenu();
    expect(screen.getByText('Spėjimai')).toBeDefined();
    expect(screen.getByText('Suvestinė')).toBeDefined();
    expect(screen.getByText('Informacija')).toBeDefined();
    expect(screen.queryByText('Lyga')).toBeNull();
    expect(
      screen
        .getByRole('link', { name: 'Rungtynių spėjimai' })
        .getAttribute('href'),
    ).toBe('/results');
  });

  it('ends with the account: the profile and sign-out through its own form', () => {
    openMenu();
    expect(screen.getByText('Paskyra')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Profilis' }).getAttribute('href'),
    ).toBe('/userProfile');
    expect(
      screen.getByRole('button', { name: 'Atsijungti' }).getAttribute('form'),
    ).toBe('logout-form-m');
    expect(
      document.getElementById('logout-form-m')?.getAttribute('action'),
    ).toBe('/logout');
  });

  it('offers Admin to an admin only', () => {
    const { unmount } = openMenu();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    unmount();

    openMenu(playerView({ player: { ...JONAS, isAdmin: true } }));
    expect(
      screen.getByRole('link', { name: 'Admin' }).getAttribute('href'),
    ).toBe('/admin');
  });

  it('links to no page that does not exist: no Profilis or Admin yet, for an admin too; "Keisti turnyrą" since slice 5', () => {
    openMenu(playerView({ player: { ...JONAS, isAdmin: true } }), SHELL_LINKS);
    expect(screen.queryByRole('link', { name: 'Profilis' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Keisti turnyrą' }).getAttribute('href'),
    ).toBe('/tournaments/exit');
    expect(screen.getByText('Eurolyga 2026-27')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Atsijungti' })).toBeDefined();
  });
});
