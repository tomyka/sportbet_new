import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { GuestRail } from './guest-rail';
import { NAV_ENTRIES, type NavEntry } from './nav-entries';
import { guestView } from './shell-view';

// sportbet's RailNavigationTest and ShellNoRailLayoutTest, for a guest.

const PRIVACY: NavEntry = {
  label: 'Privatumas',
  href: '/privacy',
  icon: 'globe2',
  audience: 'guest',
  group: 'info',
  surfaces: ['rail'],
};

it('is the rail, under the brand', () => {
  render(<GuestRail view={guestView()} entries={NAV_ENTRIES} />);
  const rail = screen.getByTestId('rail');
  expect(rail.tagName).toBe('ASIDE');
  expect(
    within(rail).getByRole('link', { name: 'SportBet' }).getAttribute('href'),
  ).toBe('/');
});

it('lists the guest entries', () => {
  render(<GuestRail view={guestView()} entries={NAV_ENTRIES} />);
  expect(
    screen.getByRole('link', { name: 'Turnyrai' }).getAttribute('href'),
  ).toBe('/');
});

it('has no account section and nothing to sign out of', () => {
  render(<GuestRail view={guestView()} entries={NAV_ENTRIES} />);
  expect(screen.queryByText('Paskyra')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Atsijungti' })).toBeNull();
});

it('puts the information entries after a separator, below the main block', () => {
  render(<GuestRail view={guestView()} entries={[...NAV_ENTRIES, PRIVACY]} />);
  const navs = screen.getAllByRole('navigation');
  expect(navs).toHaveLength(2);
  const [main, info] = navs;
  expect(main?.textContent.trim()).toBe('Turnyrai');
  expect(info?.textContent.trim()).toBe('Privatumas');
});
