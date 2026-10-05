import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { playerView } from '../../../tests/support/shell-views';
import { BottomTabs } from './bottom-tabs';
import type { NavEntry } from './nav-entries';
import type { ShellLeagues } from './shell-view';

// sportbet's partials/bottom-nav and BottomNavLeagueTabTest (issue 144).
// Whether the league tab shows is the view's leagueTab flag
// (showsLeagueTab, shell-view.test.ts); the tabs only read it.

const TABS: readonly NavEntry[] = [
  {
    label: 'Eiga',
    href: '/',
    icon: 'globe2',
    audience: 'player',
    group: 'main',
    surfaces: ['tabs'],
    badge: 'standings',
  },
];

const TWO_LEAGUES: ShellLeagues = {
  items: [
    { id: 3, name: 'Vieša', active: true },
    { id: 7, name: 'Draugai', active: false },
  ],
};

const trophyIn = (container: HTMLElement) =>
  container.querySelector('[data-icon="trophy"]');

describe('BottomTabs', () => {
  it('is a tab per entry, under its icon, the current page marked', () => {
    render(<BottomTabs view={playerView()} entries={TABS} />);
    const tab = screen.getByRole('link', { name: 'Eiga' });
    expect(tab.getAttribute('aria-current')).toBe('page');
    expect(tab.querySelector('[data-icon="globe2"]')).not.toBeNull();
  });

  it('has no league tab for a player with one league', () => {
    const { container } = render(
      <BottomTabs view={playerView()} entries={TABS} />,
    );
    expect(trophyIn(container)).toBeNull();
  });

  it('has a league tab listing the other league for a player with two', () => {
    const { container } = render(
      <BottomTabs view={playerView({ leagues: TWO_LEAGUES })} entries={TABS} />,
    );
    expect(trophyIn(container)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Vieša' })).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Draugai', hidden: true }),
    ).toBeDefined();
  });

  it('has no league tab for a player with no league', () => {
    const { container } = render(
      <BottomTabs view={playerView({ leagues: null })} entries={TABS} />,
    );
    expect(trophyIn(container)).toBeNull();
  });

  it("follows the view's leagueTab flag, not its own count", () => {
    const { container } = render(
      <BottomTabs
        view={playerView({ leagues: TWO_LEAGUES, leagueTab: false })}
        entries={TABS}
      />,
    );
    expect(trophyIn(container)).toBeNull();
  });

  it('is not drawn when the player has no tab and no league tab', () => {
    const { container } = render(
      <BottomTabs view={playerView({ leagues: null })} entries={[]} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
