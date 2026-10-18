import type { JSX } from 'react';
import type { PointsChart } from '@sportbet/domain';
import { CARD_FRAME } from '../hub/styles';
import { ChartInteraction } from './chart-interaction';

/**
 * sportbet's "Grafikas" (summary/chart.blade.php): "Taškų dinamika" and the
 * number of scored games over the chart of every listed player's total.
 */
export function PointsChartView({
  chart,
}: {
  chart: PointsChart;
}): JSX.Element {
  return (
    <div data-testid="chart-card" data-fluid className={`${CARD_FRAME} p-0`}>
      <div className="flex items-baseline gap-2.5 border-b border-border px-5 pt-4 pb-3">
        <h2 className="m-0 text-base font-bold text-text">Taškų dinamika</h2>
        <span className="text-[0.8rem] text-muted">{chart.count}</span>
      </div>
      <ChartInteraction chart={chart} />
    </div>
  );
}
