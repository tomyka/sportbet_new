import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DASHBOARD, game } from '../../../tests/support/dashboard';
import { ActivityFeed } from './activity-feed';

describe('ActivityFeed: partials/activity-feed.blade.php\'s "Aktyvumas"', () => {
  it('game page: the title with its lightning, a bingo with its target, the game and its players', () => {
    render(<ActivityFeed feed={DASHBOARD.feed} />);
    const title = screen.getByText('Aktyvumas');
    expect(title.querySelector('[data-icon="lightning-fill"]')).not.toBeNull();
    const [bingo] = screen.getAllByTestId('feed-item');
    if (bingo === undefined) throw new Error('no feed item');
    expect(bingo.querySelector('[data-icon="bullseye"]')).not.toBeNull();
    expect(within(bingo).getByText('Žalgiris 88-79 Olympiacos')).toBeDefined();
    expect(within(bingo).getByText('jonas, ona')).toBeDefined();
  });

  it('game page: a run with its flame, the username and " serija ×N"', () => {
    render(<ActivityFeed feed={DASHBOARD.feed} />);
    const run = screen.getAllByTestId('feed-item')[1];
    if (run === undefined) throw new Error('no run item');
    expect(run.querySelector('[data-icon="fire"]')).not.toBeNull();
    expect(within(run).getByText('petras')).toBeDefined();
    expect(run.textContent).toBe('petras serija ×4');
  });

  it('game page: bingos first, then runs, in the order given', () => {
    render(
      <ActivityFeed
        feed={{
          bingos: [
            { game: game(2), line: 'A 1-0 B', players: 'x' },
            { game: game(1), line: 'C 2-1 D', players: 'y' },
          ],
          runs: [
            { username: 'r1', length: 5 },
            { username: 'r2', length: 3 },
          ],
        }}
      />,
    );
    expect(
      screen.getAllByTestId('feed-item').map((item) => item.textContent),
    ).toEqual(['A 1-0 Bx', 'C 2-1 Dy', 'r1 serija ×5', 'r2 serija ×3']);
  });

  it('game page: nothing at all when there is no bingo and no run', () => {
    const { container } = render(
      <ActivityFeed feed={{ bingos: [], runs: [] }} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
