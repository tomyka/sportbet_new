import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  JONAS,
  playerView,
  TWO_LEAGUES,
} from '../../../tests/support/shell-views';
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

const openContext = () => {
  fireEvent.click(screen.getByRole('button', { name: /Eurolyga/u }));
};

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
  it("carries the brand, leading to the game page (header.blade.php: route('main') @auth)", () => {
    openMenu();
    const hrefs = screen
      .getAllByRole('img', { name: 'SportBet' })
      .map((logo) => logo.closest('a')?.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((href) => href === '/main')).toBe(true);
  });

  it('opens a menu with the context switch: the tournament, its way out and the leagues', () => {
    openMenu();
    openContext();
    expect(screen.getAllByText('Eurolyga 2026-27').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('link', { name: 'Keisti turnyrą' }).getAttribute('href'),
    ).toBe('/tournaments/exit');
  });

  it("opens the context switch's panel in the menu: the leagues, a league's switch form and the way out", () => {
    openMenu(playerView({ leagues: TWO_LEAGUES }));
    openContext();
    const control = screen.getByRole('button', { name: /Eurolyga/u });
    const panel = document.getElementById(
      control.getAttribute('aria-controls') ?? '',
    );
    if (panel === null) throw new Error('no panel');
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Draugai', 'Vieša']);
    const form = within(panel)
      .getByRole('button', { name: 'Draugai' })
      .closest('form');
    expect(form?.getAttribute('action')).toBe('/leagues/switch');
    expect(
      form?.querySelector('input[name="leagueID"]')?.getAttribute('value'),
    ).toBe('7');
    expect(
      within(panel)
        .getByRole('link', { name: 'Keisti turnyrą' })
        .getAttribute('href'),
    ).toBe('/tournaments/exit');
  });

  it("lists the entries under the menu's labels, and no empty block", () => {
    openMenu();
    expect(screen.getByText('Spėjimai')).toBeDefined();
    expect(screen.getByText('Suvestinė')).toBeDefined();
    expect(screen.getByText('Informacija')).toBeDefined();
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
    ).toBe('/admin/index');
  });

  it("links to every page that exists: Profilis since slice 17; Keisti turnyrą since slice 5, an admin's Admin since slice 7", () => {
    openMenu(playerView({ player: { ...JONAS, isAdmin: true } }), SHELL_LINKS);
    openContext();
    expect(
      screen.getByRole('link', { name: 'Profilis' }).getAttribute('href'),
    ).toBe('/userProfile');
    expect(
      screen.getByRole('link', { name: 'Admin' }).getAttribute('href'),
    ).toBe('/admin/index');
    expect(
      screen.getByRole('link', { name: 'Keisti turnyrą' }).getAttribute('href'),
    ).toBe('/tournaments/exit');
    expect(screen.getAllByText('Eurolyga 2026-27').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Atsijungti' })).toBeDefined();
  });
});
