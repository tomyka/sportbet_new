import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { expect, it, vi } from 'vitest';
import { NavLink } from './nav-link';

const STYLES = { base: 'base', idle: 'idle', current: 'current' };

it('marks the link to the current page, with its current classes only', () => {
  render(
    <NavLink href="/" styles={STYLES}>
      Turnyrai
    </NavLink>,
  );
  const link = screen.getByRole('link', { name: 'Turnyrai' });
  expect(link.getAttribute('href')).toBe('/');
  expect(link.getAttribute('aria-current')).toBe('page');
  expect(link.className).toBe('base current');
});

it('leaves a link to another page idle', () => {
  vi.mocked(usePathname).mockReturnValueOnce('/tournament/euroleague-2026-27');
  render(
    <NavLink href="/" styles={STYLES}>
      Turnyrai
    </NavLink>,
  );
  const link = screen.getByRole('link', { name: 'Turnyrai' });
  expect(link.getAttribute('aria-current')).toBeNull();
  expect(link.className).toBe('base idle');
});

it('adds its own classes between the base and the state', () => {
  render(
    <NavLink href="/" styles={STYLES} className="caps">
      Turnyrai
    </NavLink>,
  );
  expect(screen.getByRole('link', { name: 'Turnyrai' }).className).toBe(
    'base caps current',
  );
});
