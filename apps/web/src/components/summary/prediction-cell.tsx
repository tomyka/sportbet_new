import type { JSX } from 'react';
import type { PredictionVerdict, SummaryCell } from '@sportbet/domain';
import { PointsPopover } from './points-popover';
import { MY_COLUMN } from './styles';

/** .sr-pred-ok, -fail and -pending (decision 11: no 'partial' without a shoot-out), on sportbet's tokens. */
const VERDICT: Readonly<Record<PredictionVerdict, string>> = {
  ok: 'bg-ok-tint text-ok',
  fail: 'bg-bad-tint text-bad',
  pending: 'bg-surface-2 text-muted',
};

/** .sr-pred-badge: the predicted score in its verdict's colours. */
function Badge({
  score,
  verdict,
}: {
  score: NonNullable<SummaryCell['score']>;
  verdict: PredictionVerdict;
}): JSX.Element {
  return (
    <span
      data-testid="sr-badge"
      data-verdict={verdict}
      className={`inline-block rounded-[5px] px-2 py-0.5 text-[0.71rem] leading-normal font-bold tracking-[0.01em] ${VERDICT[verdict]}`}
    >
      {`${String(score.home)}:${String(score.away)}`}
    </span>
  );
}

/** What a prediction row shows: its points once scored, and its score in a verdict badge (a blank row has none). */
function CellContent({ cell }: { cell: SummaryCell }): JSX.Element {
  return (
    <>
      {cell.points === null ? null : <PointsPopover points={cell.points} />}
      {cell.verdict === null || cell.score === null ? null : (
        <Badge score={cell.score} verdict={cell.verdict} />
      )}
    </>
  );
}

/**
 * .sr-pred-td: a player's cell on a started game - nothing without a
 * prediction row, the points once the game is scored, and the predicted
 * score in its verdict badge (a blank row has none).
 */
export function PredictionCell({
  cell,
  me,
}: {
  cell: SummaryCell | undefined;
  me: boolean;
}): JSX.Element {
  return (
    <td
      data-testid="sr-cell"
      data-me={me ? 'true' : undefined}
      className={`border-r border-b border-r-border border-b-border px-1.5 py-2 text-center align-middle ${me ? MY_COLUMN : 'bg-inherit'}`}
    >
      {cell === undefined ? null : <CellContent cell={cell} />}
    </td>
  );
}
