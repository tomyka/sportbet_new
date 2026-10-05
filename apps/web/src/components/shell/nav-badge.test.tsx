import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavBadge } from './nav-badge';
import type { BadgeKind } from './shell-view';

// sportbet's NavPredictionBadgeTest, for the markup: the badge is always
// rendered, hidden when there is nothing to do, addressed by data-missing,
// and carries its sentence.

const badgeOf = (container: HTMLElement, kind: BadgeKind) =>
  container.querySelector(`[data-missing="${kind}"]`);

describe('NavBadge', () => {
  it('is rendered but hidden when there is nothing to do', () => {
    const { container } = render(
      <NavBadge kind="results" count={0} placement="rail" />,
    );
    expect(badgeOf(container, 'results')?.hasAttribute('hidden')).toBe(true);
  });

  it('shows a mark when there is something to do', () => {
    const { container } = render(
      <NavBadge kind="results" count={2} placement="rail" />,
    );
    const badge = badgeOf(container, 'results');
    expect(badge?.hasAttribute('hidden')).toBe(false);
    expect(badge?.textContent).toBe('!');
  });

  it.each([
    ['results', 'Pateikti ne visi dienos rungtynių spėjimai.'],
    ['standings', 'Pateikti ne visi eigos spėjimai.'],
    ['survival', 'Vis dar nepasirinkote komandos Išlikimo žaidime.'],
  ] as const)('carries the %s sentence', (kind, sentence) => {
    render(<NavBadge kind={kind} count={1} placement="rail" />);
    expect(screen.getByRole('img', { name: sentence })).toBeDefined();
  });

  it('counts the pending invites in its sentence', () => {
    render(<NavBadge kind="invites" count={3} placement="menu" />);
    expect(
      screen.getByRole('img', { name: 'Nepatvirtinti kvietimai į lygas: 3' }),
    ).toBeDefined();
  });

  it('shows its sentence as a tip on hover, outside the navigation', () => {
    render(
      <nav>
        <NavBadge kind="standings" count={1} placement="tabs" />
      </nav>,
    );
    const badge = screen.getByRole('img', {
      name: 'Pateikti ne visi eigos spėjimai.',
    });

    fireEvent.mouseEnter(badge);
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('Pateikti ne visi eigos spėjimai.');
    expect(tip.parentElement).toBe(document.body);

    fireEvent.mouseLeave(badge);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
