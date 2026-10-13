import { fireEvent, render, screen, within } from '@testing-library/react';
import { must, nth } from '../../../tests/support/found';
import { describe, expect, it } from 'vitest';
import {
  chartData,
  chartLine,
  JONAS,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { ChartInteraction } from './chart-interaction';

const chart = () =>
  chartData(
    [
      chartLine(JONAS, 'jonas', 1, [500, 1500, 2050]),
      chartLine(ZUKAUSKAS, 'zuk', 2, [0, 700, 900]),
    ],
    ['OLY - ZAL', 'REA - FEN', 'BAR - PAN'],
  );

const paths = () => screen.queryAllByTestId('chart-line');

const tooltipLines = () =>
  Array.from(
    screen.getByRole('tooltip').querySelectorAll('li'),
    (line) => line.textContent,
  );

describe("ChartInteraction (the chart's tooltip and legend)", () => {
  it('shows no tooltip until a game is pointed at', () => {
    render(<ChartInteraction chart={chart()} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it("hovering a game titles the tooltip with its label and lists every player's total to one decimal", () => {
    render(<ChartInteraction chart={chart()} />);
    fireEvent.mouseEnter(nth(screen.getAllByTestId('chart-hit'), 1));
    expect(screen.getByRole('tooltip').querySelector('b')?.textContent).toBe(
      'REA - FEN',
    );
    expect(tooltipLines()).toEqual(['jonas:  15.0 t.', 'zuk:  7.0 t.']);
  });

  it('a game with no label is "Žaidimas {i}"', () => {
    render(
      <ChartInteraction
        chart={chartData(
          [chartLine(JONAS, 'jonas', 1, [100, 200])],
          ['OLY - ZAL', ''],
        )}
      />,
    );
    fireEvent.mouseEnter(nth(screen.getAllByTestId('chart-hit'), 1));
    expect(screen.getByRole('tooltip').querySelector('b')?.textContent).toBe(
      'Žaidimas 2',
    );
  });

  it('leaving the chart hides the tooltip', () => {
    render(<ChartInteraction chart={chart()} />);
    fireEvent.mouseEnter(nth(screen.getAllByTestId('chart-hit'), 0));
    fireEvent.mouseLeave(must(document.querySelector('svg')));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keyboard: focusing the chart shows the latest game, the arrows move along the games, Home and End jump', () => {
    render(<ChartInteraction chart={chart()} />);
    const plot = screen.getByRole('group', { name: 'Taškų dinamika' });
    fireEvent.focus(plot);
    expect(screen.getByRole('tooltip').querySelector('b')?.textContent).toBe(
      'BAR - PAN',
    );
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    expect(screen.getByRole('tooltip').querySelector('b')?.textContent).toBe(
      'REA - FEN',
    );
    fireEvent.keyDown(plot, { key: 'Home' });
    expect(screen.getByRole('tooltip').querySelector('b')?.textContent).toBe(
      'OLY - ZAL',
    );
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    expect(screen.getByRole('tooltip').querySelector('b')?.textContent).toBe(
      'OLY - ZAL',
    );
    fireEvent.keyDown(plot, { key: 'End' });
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(screen.getByRole('tooltip').querySelector('b')?.textContent).toBe(
      'BAR - PAN',
    );
    fireEvent.blur(plot);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('an arrow before any game is active starts at the latest', () => {
    render(<ChartInteraction chart={chart()} />);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Taškų dinamika' }), {
      key: 'ArrowLeft',
    });
    expect(screen.getByRole('tooltip').querySelector('b')?.textContent).toBe(
      'REA - FEN',
    );
  });

  it('other keys do nothing', () => {
    render(<ChartInteraction chart={chart()} />);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Taškų dinamika' }), {
      key: 'a',
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a legend button per player, in the table order, each pressed while its line shows', () => {
    render(<ChartInteraction chart={chart()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'jonas',
      'zuk',
    ]);
    expect(
      buttons.map((button) => button.getAttribute('aria-pressed')),
    ).toEqual(['true', 'true']);
  });

  it("a legend click hides the player's line, and the tooltip leaves them out; a second click brings it back", () => {
    render(<ChartInteraction chart={chart()} />);
    const jonas = screen.getByRole('button', { name: 'jonas' });
    fireEvent.click(jonas);
    expect(paths().map((path) => path.getAttribute('data-player'))).toEqual([
      '2',
    ]);
    expect(jonas.getAttribute('aria-pressed')).toBe('false');
    fireEvent.mouseEnter(nth(screen.getAllByTestId('chart-hit'), 0));
    expect(tooltipLines()).toEqual(['zuk:  0.0 t.']);
    fireEvent.click(jonas);
    expect(paths()).toHaveLength(2);
    expect(jonas.getAttribute('aria-pressed')).toBe('true');
  });

  it("each legend dot is in its line's series token", () => {
    render(<ChartInteraction chart={chart()} />);
    const dots = screen
      .getAllByRole('button')
      .map(
        (button) =>
          within(button).getByTestId('chart-dot').style.backgroundColor,
      );
    expect(dots).toEqual(['var(--color-series-1)', 'var(--color-series-2)']);
  });

  it('the scale follows what shows: with the leader hidden the axis tops out lower', () => {
    render(<ChartInteraction chart={chart()} />);
    const top = () =>
      Array.from(document.querySelectorAll('text'), (text) => text.textContent);
    expect(top()).toContain('25');
    fireEvent.click(screen.getByRole('button', { name: 'jonas' }));
    expect(top()).not.toContain('25');
    expect(top()).toContain('10');
  });

  it('with no scored game there is no tooltip to open, and the legend still names the players', () => {
    render(
      <ChartInteraction
        chart={chartData([chartLine(JONAS, 'jonas', 1, [])], [])}
      />,
    );
    fireEvent.focus(screen.getByRole('group', { name: 'Taškų dinamika' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByRole('button', { name: 'jonas' })).toBeDefined();
  });
});
