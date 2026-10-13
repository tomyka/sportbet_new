import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  chartData,
  chartLine,
  JONAS,
} from '../../../tests/support/summary-views';
import { PointsChartView } from './points-chart-view';

describe('PointsChartView (summary/chart.blade.php)', () => {
  it('the header "Taškų dinamika" with the game count', () => {
    render(
      <PointsChartView
        chart={chartData(
          [chartLine(JONAS, 'jonas', 1, [100, 200])],
          ['OLY - ZAL', 'REA - FEN'],
        )}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Taškų dinamika' }),
    ).toBeDefined();
    expect(screen.getByText('2 rungtynių')).toBeDefined();
  });

  it('one game reads "1 rungtynės"', () => {
    render(
      <PointsChartView
        chart={chartData([chartLine(JONAS, 'jonas', 1, [100])], ['OLY - ZAL'])}
      />,
    );
    expect(screen.getByText('1 rungtynės')).toBeDefined();
  });

  it('draws the chart and its legend', () => {
    render(
      <PointsChartView
        chart={chartData([chartLine(JONAS, 'jonas', 1, [100])], ['OLY - ZAL'])}
      />,
    );
    expect(screen.getAllByTestId('chart-line')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'jonas' })).toBeDefined();
  });

  it('with no scored game: "0 rungtynių" and an empty chart, no line', () => {
    render(
      <PointsChartView
        chart={chartData([chartLine(JONAS, 'jonas', 1, [])], [])}
      />,
    );
    expect(screen.getByText('0 rungtynių')).toBeDefined();
    expect(screen.queryAllByTestId('chart-line')).toHaveLength(0);
  });
});
