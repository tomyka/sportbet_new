import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ME } from '../../../tests/support/dashboard';
import { StatTiles } from './stat-tiles';

const tile = (label: string) => {
  const found = screen.getByText(label).closest('[data-testid="tile"]');
  if (!(found instanceof HTMLElement)) throw new Error(`no tile ${label}`);
  return within(found);
};

describe("StatTiles: stat-tiles.blade.php's four tiles", () => {
  it('game page: "vieta" with the rank and the climb over five games, "taškai" to one decimal, "bingo" and "serija"', () => {
    render(<StatTiles me={ME} />);
    expect(tile('vieta').getByText('#3')).toBeDefined();
    expect(tile('vieta').getByText('↑2 per 5 žaid.')).toBeDefined();
    expect(tile('taškai').getByText('78.9')).toBeDefined();
    expect(tile('bingo').getByText('2')).toBeDefined();
    expect(tile('serija').getByText('4')).toBeDefined();
  });

  it('game page: a fall is "↓N" in the bad colour, a climb in the good one', () => {
    const { unmount } = render(<StatTiles me={ME} />);
    expect(screen.getByText('↑2 per 5 žaid.').className).toContain('text-ok');
    unmount();
    render(<StatTiles me={{ ...ME, rankChange: -3 }} />);
    expect(screen.getByText('↓3 per 5 žaid.').className).toContain('text-bad');
  });

  it('game page: no change line when the rank held or there is no history yet', () => {
    const { unmount } = render(<StatTiles me={{ ...ME, rankChange: 0 }} />);
    expect(screen.queryByText(/per 5 žaid\./)).toBeNull();
    unmount();
    render(<StatTiles me={{ ...ME, rankChange: null }} />);
    expect(screen.queryByText(/per 5 žaid\./)).toBeNull();
  });

  it('game page: no bingo and no run print "-"', () => {
    render(<StatTiles me={{ ...ME, tiles: { bingo: 0, serija: 0 } }} />);
    expect(tile('bingo').getByText('-')).toBeDefined();
    expect(tile('serija').getByText('-')).toBeDefined();
  });

  it('game page: a player with no scored row sees no tiles, as sportbet draws none', () => {
    const { container } = render(<StatTiles me={{ ...ME, tiles: null }} />);
    expect(container.innerHTML).toBe('');
  });
});
