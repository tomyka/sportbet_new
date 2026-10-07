import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { historyOf } from '../../../tests/support/dashboard';
import { Trend } from './trend';

const rows = () => screen.getAllByTestId('trend-row').map((row) => within(row));

describe("Trend: partials/points.blade.php's history panel", () => {
  it('game page: "Paskutinės 6 rungtynės", the rank line\'s legend and the "#", "+ Tšk", "Vieta" table', () => {
    render(<Trend history={historyOf(3, 1)} />);
    expect(screen.getByText('Paskutinės 6 rungtynės')).toBeDefined();
    expect(screen.getByText('-- vieta')).toBeDefined();
    const header = within(screen.getByTestId('trend-header'));
    expect(header.getByText('#')).toBeDefined();
    expect(header.getByText('+ Tšk')).toBeDefined();
    expect(header.getByText('Vieta')).toBeDefined();
  });

  it("game page: only the last six games, numbered 1 to 6 as sportbet's game_idx", () => {
    render(<Trend history={historyOf(8, 7, 6, 5, 4, 3, 2, 1)} />);
    const shown = rows();
    expect(shown).toHaveLength(6);
    expect(shown[0]?.getByTestId('trend-index').textContent).toBe('1');
    expect(shown[0]?.getByTestId('trend-rank').textContent).toBe('#6');
    expect(shown[5]?.getByTestId('trend-index').textContent).toBe('6');
    expect(shown[5]?.getByTestId('trend-rank').textContent.trim()).toBe('#1');
    const ticks = [...document.querySelectorAll('text')].map(
      (tick) => tick.textContent,
    );
    expect(ticks).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('game page: "+ Tšk" is everything gained at the game, to one decimal (R-72)', () => {
    const history = historyOf(2, 1).map((entry, index) => ({
      ...entry,
      gainedCents: index === 0 ? 1_234 : 19_000,
    }));
    render(<Trend history={history} />);
    expect(rows()[0]?.getByText('+12.3')).toBeDefined();
    expect(rows()[1]?.getByText('+190.0')).toBeDefined();
  });

  it('game page: a climb against the game before is green with an up caret, a fall red with a down caret', () => {
    render(<Trend history={historyOf(3, 1, 2, 2)} />);
    const [first, up, down, held] = screen.getAllByTestId('trend-rank');
    expect(first?.querySelector('[data-icon]')).toBeNull();
    expect(up?.className).toContain('text-ok');
    expect(up?.querySelector('[data-icon="caret-up-fill"]')).not.toBeNull();
    expect(down?.className).toContain('text-bad');
    expect(down?.querySelector('[data-icon="caret-down-fill"]')).not.toBeNull();
    expect(held?.querySelector('[data-icon]')).toBeNull();
  });

  it('game page: the line runs over the points, best rank at the top, the last dot ringed', () => {
    const { container } = render(<Trend history={historyOf(3, 1, 2)} />);
    const svg = container.querySelector('svg[data-testid="trend-chart"]');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 120 90');
    expect(svg?.querySelector('polyline')?.getAttribute('points')).toBe(
      '0,70 60,10 120,40',
    );
    const dots = [...(svg?.querySelectorAll('circle') ?? [])];
    expect(dots.map((dot) => dot.getAttribute('r'))).toEqual(['3', '3', '4']);
  });

  it('game page: one game draws a dot in the middle and no line', () => {
    const { container } = render(<Trend history={historyOf(1)} />);
    expect(container.querySelector('polyline')).toBeNull();
    expect(container.querySelector('circle')?.getAttribute('cx')).toBe('60');
    expect(container.querySelector('circle')?.getAttribute('cy')).toBe('10');
  });
});
