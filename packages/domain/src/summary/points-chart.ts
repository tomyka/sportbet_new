import type { LeagueTableRow } from '../dashboard/league-table-rows';
import type { Season } from '../round/season';
import type { GameId, PlayerId, TeamId } from '../shared/ids';
import type { ChartColour } from './chart-colour';

/** Points are drawn on the lines only up to this many games (ChartController's chart). */
const MAX_POINTED_GAMES = 40;

/** How many colours the chart's series tokens hold (`--color-series-1`..`10`). */
const SERIES_COLOURS = 10;

/** How many characters of a team's name label a game. */
const LABEL_LETTERS = 3;

export interface ChartGame {
  readonly game: GameId;
  /** "HOM - AWA": the first three characters of each team, upper case. */
  readonly label: string;
}

export interface ChartLine {
  readonly player: PlayerId;
  readonly username: string;
  /** 1 to 10: the line's position in the table, wrapping; picks `--color-series-n`. */
  readonly series: number;
  /**
   * The player's own colour from sportbet (R-136), where there is one: the
   * line is drawn in it, and in `--color-series-n` where it is null.
   */
  readonly colour: ChartColour | null;
  /** The cumulative total after each of `games`, to the cent (R-85). */
  readonly totalsCents: readonly number[];
}

export interface PointsChart {
  /** The scored games by tip-off then id: the x-axis. */
  readonly games: readonly ChartGame[];
  /** "1 rungtynės" / "N rungtynių". */
  readonly count: string;
  /** Points are marked on the lines (up to 40 games). */
  readonly drawPoints: boolean;
  /** One per listed player, in the league table's order (R-102). */
  readonly lines: readonly ChartLine[];
}

/** The first three code points, upper-cased: characters, not bytes. */
function letters(name: string): string {
  return Array.from(name).slice(0, LABEL_LETTERS).join('').toUpperCase();
}

/** "1 rungtynės" for one game, "N rungtynių" otherwise (also 0). */
function countText(games: number): string {
  return games === 1 ? '1 rungtynės' : `${String(games)} rungtynių`;
}

function teamName(names: ReadonlyMap<TeamId, string>, team: TeamId): string {
  const name = names.get(team);
  if (name === undefined) {
    throw new Error('pointsChart: a team of a scored game has no name');
  }
  return name;
}

/**
 * ChartController::getChartData: the tournament's scored games as the
 * x-axis and one line per listed player, the cumulative total after each.
 * Every line is the table row's own history (R-85, R-102): match, serija,
 * standings and survival points, each at the game R-72 places it, so a
 * line ends at its row's total. A line carries the player's own colour when
 * they have one (R-136), and its position's series number either way.
 */
export function pointsChart(input: {
  readonly season: Season;
  readonly table: readonly LeagueTableRow[];
  readonly teamNames: ReadonlyMap<TeamId, string>;
  /** The players who have a colour of their own (loadChartColours). */
  readonly colours: ReadonlyMap<PlayerId, ChartColour>;
}): PointsChart {
  const { season, table, teamNames, colours } = input;
  const games = season.scoredInPlayOrder().map((game) => ({
    game: game.id,
    label: `${letters(teamName(teamNames, game.home))} - ${letters(teamName(teamNames, game.away))}`,
  }));
  return Object.freeze({
    games,
    count: countText(games.length),
    drawPoints: games.length <= MAX_POINTED_GAMES,
    lines: table.map((row, index) => {
      if (
        row.history.length !== games.length ||
        row.history.some((entry, at) => entry.game !== games[at]?.game)
      ) {
        throw new Error('pointsChart: a history that is not the scored games');
      }
      return Object.freeze({
        player: row.player,
        username: row.username,
        series: (index % SERIES_COLOURS) + 1,
        colour: colours.get(row.player) ?? null,
        totalsCents: row.history.map(({ totalCents }) => totalCents),
      });
    }),
  });
}
