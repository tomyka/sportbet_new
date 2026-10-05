import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { NavEntry } from './nav-entries';
import { RailNav } from './rail-nav';
import { guestView } from './shell-view';

const ENTRIES: readonly NavEntry[] = [
  {
    label: 'Turnyrai',
    href: '/',
    icon: 'globe2',
    audience: 'guest',
    group: 'main',
    surfaces: ['rail'],
  },
  {
    label: 'Lygos',
    href: '/leagues',
    icon: 'trophy',
    audience: 'player',
    group: 'league',
    surfaces: ['rail'],
    badge: 'invites',
  },
];

it('links each entry under its icon, the current page marked', () => {
  render(<RailNav entries={ENTRIES} badges={guestView().badges} />);
  const turnyrai = screen.getByRole('link', { name: 'Turnyrai' });
  expect(turnyrai.getAttribute('href')).toBe('/');
  expect(turnyrai.getAttribute('aria-current')).toBe('page');
  expect(turnyrai.querySelector('[data-icon="globe2"]')).not.toBeNull();
  expect(
    screen.getByRole('link', { name: 'Lygos' }).getAttribute('aria-current'),
  ).toBeNull();
});
