import type { JSX } from 'react';
import {
  onePlace,
  type StageBreakdown,
  type StandingsCell,
  type StandingsLineKey,
  type StandingsSummary,
} from '@sportbet/domain';
import { CARD_FRAME } from '../hub/styles';
import { TeamCrest } from '../hub/team-crest';
import { HoverPop } from './hover-pop';
import { BreakdownRows, StandingsBadgeView } from './standings-badge';
import { StandingsLegend } from './standings-legend';

const STAGES: readonly StandingsLineKey[] = [
  'place',
  'playOffs',
  'finalFour',
  'final',
];

/**
 * The total's popover heads each stage with R-76's Euroleague names (the
 * league table's breakdown); the badges' popovers keep sportbet's.
 */
const TOTAL_LABEL: Readonly<Record<StandingsLineKey, string>> = {
  place: 'Reguliarus sezonas',
  playOffs: 'Atkrintamosios',
  finalFour: 'Finalo ketvertas',
  final: 'Finalas',
};

/** .sst-pts: the cell's points above 0, with the stages' lines on hover or focus. */
function CellTotal({
  cents,
  lines,
}: {
  cents: number;
  lines: readonly StageBreakdown[];
}): JSX.Element | null {
  if (cents <= 0) return null;
  return (
    <HoverPop
      testId="sst-total"
      className="mt-0.5 block text-[0.62rem] leading-none font-bold text-accent"
      content={
        <div className="text-[0.72rem]">
          {lines.map((line) => (
            <BreakdownRows
              key={line.stage}
              label={TOTAL_LABEL[line.stage]}
              breakdown={line}
            />
          ))}
        </div>
      }
    >
      {onePlace(cents)}
    </HoverPop>
  );
}

/** .sst-pred-cell: a player's four badges for a team, and their total. */
function PredictionCell({
  cell,
}: {
  cell: StandingsCell | undefined;
}): JSX.Element {
  return (
    <td
      data-testid="sst-cell"
      className="border border-border px-1 pt-1 pb-0.5 text-center align-middle"
    >
      {cell === undefined ? null : (
        <>
          <div className="flex items-center justify-center gap-0.5">
            {STAGES.map((stage) => (
              <StandingsBadgeView
                key={stage}
                stage={stage}
                badge={cell[stage]}
              />
            ))}
          </div>
          <CellTotal cents={cell.totalCents} lines={cell.totalLines} />
        </>
      )}
    </td>
  );
}

/**
 * sportbet's "Eiga" summary (summary/standings.blade.php): the legend, and
 * a table of every team against every listed player in the league table's
 * order, each cell the player's four badges for the team (place, 1/4, 1/2,
 * final) and their points. Euroleague has no groups, so no group rows.
 */
export function StandingsSummaryView({
  data,
}: {
  data: StandingsSummary;
}): JSX.Element {
  return (
    <div className={`${CARD_FRAME} p-0`}>
      <StandingsLegend />
      <table className="w-full border-collapse text-[0.8rem]">
        <thead>
          <tr>
            <th className="min-w-[140px] border border-on-accent/15 bg-accent py-2 pr-1.5 pl-3 text-left text-[0.72rem] font-bold tracking-[0.3px] whitespace-nowrap text-on-accent">
              Komanda
            </th>
            {data.columns.map(({ player, username }) => (
              <th
                key={player}
                className="min-w-[100px] border border-on-accent/15 bg-accent px-1.5 py-2 text-center text-[0.72rem] font-bold tracking-[0.3px] whitespace-nowrap text-on-accent"
              >
                {username}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.teams.map((team) => (
            <tr
              key={team.team}
              data-testid="sst-team-row"
              className="border-b border-border hover:bg-accent-tint"
            >
              <td className="border-r-2 border-r-border py-[5px] pr-2.5 pl-3 whitespace-nowrap">
                <div className="flex items-center gap-[7px]">
                  <TeamCrest team={team.name} size="line" />
                  <span className="text-[0.8rem] font-medium text-text">
                    {team.name}
                  </span>
                </div>
              </td>
              {data.columns.map(({ player }) => (
                <PredictionCell key={player} cell={team.cells.get(player)} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
