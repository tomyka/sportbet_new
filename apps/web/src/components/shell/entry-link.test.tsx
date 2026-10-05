import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import { EntryLink } from './entry-link';
import type { NavEntry, NavSurface } from './nav-entries';
import { guestView, type BadgeKind, type ShellBadges } from './shell-view';

// One navigation entry, drawn on each surface as sportbet draws it there
// (.sb-rail-link, the phone menu's .sb-nav-link, .sb-tab, the guest
// bar's .sb-nav-pill), with its badge where the surface carries one
// (NavPredictionBadgeTest). Every navigation draws its entries through
// this, so the badges are tested here, once.

const LYGOS: NavEntry = {
  label: 'Lygos',
  href: '/',
  icon: 'trophy',
  audience: 'player',
  group: 'league',
  surfaces: ['rail', 'menu', 'tabs', 'pills'],
};
const BADGED: NavEntry = { ...LYGOS, badge: 'invites' };

const NONE: ShellBadges = guestView().badges;
const withInvites = (invites: number): ShellBadges => ({ ...NONE, invites });

function draw(
  surface: NavSurface,
  entry: NavEntry = LYGOS,
  badges: ShellBadges = NONE,
) {
  return render(<EntryLink entry={entry} surface={surface} badges={badges} />);
}

const link = () => screen.getByRole('link', { name: /Lygos/ });
const badgeOf = (container: HTMLElement, kind: BadgeKind) =>
  container.querySelector(`[data-missing="${kind}"]`);

describe('EntryLink on the rail', () => {
  it('is a capitalised rail link under its icon, the current page marked', () => {
    draw('rail');
    expect(link().getAttribute('href')).toBe('/');
    expect(link().getAttribute('aria-current')).toBe('page');
    expect(link().className).toContain('uppercase');
    expect(link().className).toContain('border-rail-accent');
    expect(link().querySelector('[data-icon="trophy"]')).not.toBeNull();
    expect(link().textContent).toBe(' Lygos');
  });

  it('is idle off its page', () => {
    vi.mocked(usePathname).mockReturnValueOnce('/kitur');
    draw('rail');
    expect(link().getAttribute('aria-current')).toBeNull();
    expect(link().className).toContain('border-transparent');
  });
});

describe('EntryLink in the phone menu', () => {
  it('is a menu link under its icon, the current page marked', () => {
    draw('menu');
    expect(link().getAttribute('aria-current')).toBe('page');
    expect(link().className).toContain('bg-rail-wash-lg');
    expect(link().className).not.toContain('uppercase');
    expect(link().textContent).toBe(' Lygos');
  });
});

describe('EntryLink as a bottom tab', () => {
  it('is a tab, its label under its icon, the current page marked', () => {
    draw('tabs');
    expect(link().getAttribute('aria-current')).toBe('page');
    expect(link().className).toContain('text-rail-accent');
    const [icon, label] = link().children;
    expect(icon?.querySelector('[data-icon="trophy"]')).not.toBeNull();
    expect(label?.textContent).toBe('Lygos');
  });
});

describe('EntryLink as a guest pill', () => {
  it('is named by its label, shown only from 576px, and never marked current', () => {
    draw('pills');
    const pill = screen.getByRole('link', { name: 'Lygos' });
    expect(pill.getAttribute('href')).toBe('/');
    expect(pill.getAttribute('aria-current')).toBeNull();
    expect(pill.querySelector('.hidden.sm\\:inline')?.textContent).toBe(
      ' Lygos',
    );
  });

  it('carries no badge', () => {
    const { container } = draw('pills', BADGED, withInvites(2));
    expect(badgeOf(container, 'invites')).toBeNull();
  });
});

describe("EntryLink's badge", () => {
  it.each(['rail', 'menu', 'tabs'] as const)(
    'is drawn on the %s, hidden when there is nothing to do',
    (surface) => {
      const { container } = draw(surface, BADGED, NONE);
      expect(badgeOf(container, 'invites')?.hasAttribute('hidden')).toBe(true);
    },
  );

  it.each(['rail', 'menu', 'tabs'] as const)(
    "is shown on the %s by the view's count, inside the link",
    (surface) => {
      const { container } = draw(surface, BADGED, withInvites(2));
      const badge = badgeOf(container, 'invites');
      expect(badge?.hasAttribute('hidden')).toBe(false);
      expect(badge?.closest('a')).toBe(link());
      expect(
        screen.getByRole('img', { name: 'Nepatvirtinti kvietimai į lygas: 2' }),
      ).toBeDefined();
    },
  );

  it('is not drawn for an entry without one', () => {
    const { container } = draw('rail', LYGOS, withInvites(2));
    expect(container.querySelector('[data-missing]')).toBeNull();
  });
});
