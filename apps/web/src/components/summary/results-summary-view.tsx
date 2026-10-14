import type { JSX } from 'react';
import type { ResultsSummaryData } from '@sportbet/db';
import {
  numberFormat,
  type PlayerId,
  type SummaryColumn,
  type SummaryGame,
  type SummaryRound,
  type TeamId,
} from '@sportbet/domain';
import { TeamCrest } from '../hub/team-crest';
import { teamName } from '../survival/survival-text';
import { PredictionCell } from './prediction-cell';
import { RoundGroup } from './round-toggle';
import { MY_COLUMN, STICKY_COLUMN } from './styles';

/** A sum is shown above 0 and blank otherwise, as sportbet's table leaves it. */
const sumText = (tenths: number | undefined): string =>
  tenths === undefined || tenths <= 0 ? '' : numberFormat(tenths, 1);

/** The avatar's letter: the username's first character, upper case. */
const initialOf = (username: string): string =>
  (Array.from(username)[0] ?? '').toUpperCase();

/** .sr-hdr-user: the avatar letter, the username kept for the title and screen readers. */
function ColumnHead({
  column,
  me,
}: {
  column: SummaryColumn;
  me: boolean;
}): JSX.Element {
  return (
    <th
      title={column.username}
      data-me={me ? 'true' : undefined}
      className={`sticky top-0 z-[2] max-w-14 min-w-[42px] border-r border-b-2 border-r-border px-1.5 py-2 text-center font-semibold text-text ${me ? `${MY_COLUMN} border-b-accent` : 'border-b-border-strong bg-surface-2'}`}
    >
      <span
        className={`mx-auto mb-1 flex size-[30px] items-center justify-center rounded-full border-[1.5px] text-[0.7rem] leading-none font-extrabold ${me ? 'border-accent bg-accent text-on-accent' : 'border-border-strong bg-surface text-text'}`}
      >
        {initialOf(column.username)}
      </span>
      <span className="sr-only">{column.username}</span>
    </th>
  );
}

/** .sr-game-td: both crests round the result ("-" before it), then "Home · Away". */
function GameHead({
  game,
  names,
}: {
  game: SummaryGame;
  names: ReadonlyMap<TeamId, string>;
}): JSX.Element {
  const home = teamName(names, game.home);
  const away = teamName(names, game.away);
  return (
    <td
      className={`${STICKY_COLUMN} border-r-2 border-b border-r-border border-b-border bg-inherit px-3 py-2 align-middle`}
    >
      <div className="mb-[3px] flex items-center gap-1.5">
        <TeamCrest team={home} size="line" />
        <span
          data-testid="sr-result"
          className="min-w-10 rounded-[6px] border border-border bg-surface-2 px-1.5 py-px text-center text-[0.82rem] font-extrabold tracking-[0.02em]"
        >
          {game.result === null
            ? '-'
            : `${String(game.result.home)}:${String(game.result.away)}`}
        </span>
        <TeamCrest team={away} size="line" />
      </div>
      <div className="max-w-[168px] truncate text-[0.69rem] text-muted">
        {`${home} · ${away}`}
      </div>
    </td>
  );
}

function RoundRows({
  round,
  columns,
  viewer,
  names,
}: {
  round: SummaryRound;
  columns: readonly SummaryColumn[];
  viewer: PlayerId;
  names: ReadonlyMap<TeamId, string>;
}): JSX.Element {
  return (
    <RoundGroup
      name={round.name}
      count={round.games.length}
      defaultOpen={round.open}
      columns={columns.map(({ player }) => ({
        key: player,
        text: sumText(round.totalTenths.get(player)),
        me: player === viewer,
      }))}
    >
      {round.games.map((game) => (
        <tr
          key={game.game}
          className="bg-card even:bg-surface-2 hover:bg-accent-tint"
        >
          <GameHead game={game} names={names} />
          {columns.map(({ player }) => (
            <PredictionCell
              key={player}
              cell={game.cells.get(player)}
              me={player === viewer}
            />
          ))}
        </tr>
      ))}
    </RoundGroup>
  );
}

/**
 * sportbet's "Prognozės" (summary/results.blade.php): everyone's
 * predictions on the games no longer open, a round at a time. A sticky game
 * column and header, a column per player in the league table's order with
 * the viewer's marked, and "Viso" at the foot.
 */
export function ResultsSummaryView({
  data,
  viewer,
}: {
  data: ResultsSummaryData;
  viewer: PlayerId;
}): JSX.Element {
  const { summary, teamNames } = data;
  return (
    <div className="max-h-[calc(100vh-180px)] overflow-auto rounded-[12px] border border-border">
      <table className="m-0 w-max min-w-full border-separate border-spacing-0 text-[0.8rem] whitespace-nowrap">
        <thead>
          <tr>
            <th
              className={`${STICKY_COLUMN} sticky top-0 z-[3] min-w-[130px] border-r border-b-2 border-r-border border-b-border-strong bg-surface-2 px-2 pt-1.5 pb-2 text-left font-semibold text-text`}
            >
              Rungtynės
            </th>
            {summary.columns.map((column) => (
              <ColumnHead
                key={column.player}
                column={column}
                me={column.player === viewer}
              />
            ))}
          </tr>
        </thead>
        {summary.rounds.map((round) => (
          <RoundRows
            key={round.round}
            round={round}
            columns={summary.columns}
            viewer={viewer}
            names={teamNames}
          />
        ))}
        <tfoot>
          <tr>
            <td
              className={`${STICKY_COLUMN} sticky bottom-0 z-[3] border-t-2 border-r-2 border-t-accent border-r-border bg-surface-2 px-3 py-[9px] text-left text-[0.78rem] font-extrabold tracking-[0.05em] text-accent uppercase`}
            >
              Viso
            </td>
            {summary.columns.map(({ player }) => (
              <td
                key={player}
                data-me={player === viewer ? 'true' : undefined}
                className={`sticky bottom-0 z-[2] border-t-2 border-t-accent px-1.5 py-[9px] text-center text-[0.82rem] font-extrabold text-accent ${player === viewer ? MY_COLUMN : 'bg-surface-2'}`}
              >
                {sumText(summary.totalTenths.get(player))}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
