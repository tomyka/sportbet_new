import type { LeagueTableRow } from '../dashboard/league-table-rows';
import { roundUnits } from '../points/fixed-point';
import type { PointsRows } from '../recalculation/recalculation';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { GameId, PlayerId, RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { predictionVerdict, type PredictionVerdict } from './verdict';

/** A player's prediction on a game no longer open: the scores, or none for a blank row. */
export interface StartedPrediction {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly home: number | null;
  readonly away: number | null;
}

export interface SummaryColumn {
  readonly player: PlayerId;
  readonly username: string;
}

export interface SummaryCell {
  /** Null for a blank row: no badge. */
  readonly score: { readonly home: number; readonly away: number } | null;
  readonly verdict: PredictionVerdict | null;
  /** Present once the game is scored: full + serija, and the popover's parts, in tenths (each rounded to one place first). */
  readonly points: {
    readonly totalTenths: number;
    readonly winnerTenths: number;
    readonly marginTenths: number;
    readonly bingoTenths: number;
    readonly serijaTenths: number;
  } | null;
}

export interface SummaryGame {
  readonly game: GameId;
  readonly home: TeamId;
  readonly away: TeamId;
  /** Null before a result (and while postponed): shown as "-". */
  readonly result: { readonly home: number; readonly away: number } | null;
  /** Only the players who have a prediction row on the game. */
  readonly cells: ReadonlyMap<PlayerId, SummaryCell>;
}

export interface SummaryRound {
  readonly round: RoundNumber;
  readonly name: string;
  /** Unfolded at first. */
  readonly open: boolean;
  /** Match + serija of the round's shown games; 0 for a player with no row (the view blanks it). */
  readonly totalTenths: ReadonlyMap<PlayerId, number>;
  readonly games: readonly SummaryGame[];
}

export interface ResultsSummary {
  /** R-102: the league table's order. */
  readonly columns: readonly SummaryColumn[];
  readonly rounds: readonly SummaryRound[];
  /** "Viso": match + serija of every shown game. */
  readonly totalTenths: ReadonlyMap<PlayerId, number>;
}

/**
 * Whether others' predictions on the game may be shown: it is no longer open
 * (GameLock::closedSql), and it is not a postponed game that has not tipped
 * off, which a new date reopens (R-41).
 */
function isShown(game: Game, now: Instant): boolean {
  return !game.isOpenAt(now) && !(game.postponed && game.lockedSince === null);
}

type MatchRow = PointsRows['matches'][number];

type CellPoints = NonNullable<SummaryCell['points']>;

const NO_POINTS: CellPoints = Object.freeze({
  totalTenths: 0,
  winnerTenths: 0,
  marginTenths: 0,
  bingoTenths: 0,
  serijaTenths: 0,
});

/** Hundredths to tenths, half away from zero: the SQL's `ROUND(x, 1)`. */
const tenthsOf = (hundredths: number): number => roundUnits(hundredths, 1);

/**
 * The popover's parts of a scored game: zeros for a prediction with no
 * points row. sportbet's query rounds every part to one place in SQL and the
 * page adds the rounded full points to the rounded streak bonus, so the
 * total is that sum of tenths, never the sum of the hundredths rounded.
 */
function pointsOf(row: MatchRow | undefined): CellPoints {
  if (row === undefined) return NO_POINTS;
  return Object.freeze({
    totalTenths:
      tenthsOf(row.points.full.hundredths) + tenthsOf(row.serija.hundredths),
    winnerTenths: tenthsOf(row.points.winner.hundredths),
    marginTenths: tenthsOf(row.points.margin.hundredths),
    bingoTenths: tenthsOf(row.points.bingo.hundredths),
    serijaTenths: tenthsOf(row.serija.hundredths),
  });
}

/** One prediction's cell: its badge, and its points once the game is scored. */
function cellOf(
  game: Game,
  knockout: boolean,
  prediction: StartedPrediction,
  row: MatchRow | undefined,
): SummaryCell {
  const score =
    prediction.home === null || prediction.away === null
      ? null
      : { home: prediction.home, away: prediction.away };
  return Object.freeze({
    score,
    verdict: predictionVerdict({
      game,
      knockout,
      prediction: score,
      points: row?.points ?? null,
    }),
    points: game.result === null ? null : pointsOf(row),
  });
}

/** Each game's predictions by player; a game outside the season is an impossible state. */
function predictionsByGame(
  season: Season,
  predictions: readonly StartedPrediction[],
): ReadonlyMap<GameId, ReadonlyMap<PlayerId, StartedPrediction>> {
  const byGame = new Map<GameId, Map<PlayerId, StartedPrediction>>();
  for (const prediction of predictions) {
    if (season.game(prediction.game) === undefined) {
      throw new Error(
        'resultsSummary: a prediction on a game not in the season',
      );
    }
    const players =
      byGame.get(prediction.game) ?? new Map<PlayerId, StartedPrediction>();
    players.set(prediction.player, prediction);
    byGame.set(prediction.game, players);
  }
  return byGame;
}

/** Every player's sum of the cells' points; 0 for a player with none. */
function sumsOf(
  columns: readonly SummaryColumn[],
  cells: readonly ReadonlyMap<PlayerId, SummaryCell>[],
): ReadonlyMap<PlayerId, number> {
  return new Map(
    columns.map(({ player }) => [
      player,
      cells.reduce(
        (sum, each) => sum + (each.get(player)?.points?.totalTenths ?? 0),
        0,
      ),
    ]),
  );
}

/** Rounds with a started unscored game first, then finished ones, most recent tip-off first. */
function roundOrder(
  rounds: ReadonlyMap<RoundNumber, readonly Game[]>,
): RoundNumber[] {
  const pending = (games: readonly Game[]) =>
    games.some((game) => game.result === null);
  const lastTipOff = (games: readonly Game[]) =>
    Math.max(...games.map((game) => game.tipOff));
  const entries = [...rounds.entries()];
  return [
    ...entries.filter(([, games]) => pending(games)).map(([round]) => round),
    ...entries
      .filter(([, games]) => !pending(games))
      .sort(
        ([roundA, a], [roundB, b]) =>
          lastTipOff(b) - lastTipOff(a) || roundB - roundA,
      )
      .map(([round]) => round),
  ];
}

/** What every game and round of one summary is read from. */
interface SummaryContext {
  readonly season: Season;
  readonly columns: readonly SummaryColumn[];
  readonly predictions: ReadonlyMap<
    GameId,
    ReadonlyMap<PlayerId, StartedPrediction>
  >;
  readonly matchRows: ReadonlyMap<string, MatchRow>;
}

/** One shown game: its result and a cell for each player with a prediction row on it. */
function summaryGame(context: SummaryContext, game: Game): SummaryGame {
  const knockout = context.season.isKnockout(game.round);
  const cells = new Map<PlayerId, SummaryCell>();
  for (const { player } of context.columns) {
    const prediction = context.predictions.get(game.id)?.get(player);
    if (prediction !== undefined) {
      const row = context.matchRows.get(`${player}/${String(game.id)}`);
      cells.set(player, cellOf(game, knockout, prediction, row));
    }
  }
  return Object.freeze({
    game: game.id,
    home: game.home,
    away: game.away,
    result:
      game.result === null
        ? null
        : { home: game.result.home, away: game.result.away },
    cells,
  });
}

/**
 * PredictionResultController::getPredictionResultSummary and
 * getPredictionGamesProfile: everyone's predictions on the tournament's
 * games that are no longer open (R-86), grouped by round: rounds with a
 * started unscored game first, then finished rounds, the most recent tip-off
 * first. A round starts unfolded when it has a started unscored game or is
 * the current round. One column per listed player in the league table's
 * order (R-102). A game is shown with its predictions only once it is no
 * longer open: another player's prediction on an open game is never shown,
 * whatever `predictions` holds. Sums are of the cells' tenths (match + serija).
 */
export function resultsSummary(input: {
  readonly season: Season;
  readonly now: Instant;
  /** The column order (R-102). */
  readonly table: readonly LeagueTableRow[];
  readonly rows: Pick<PointsRows, 'matches'>;
  /** Listed players' predictions on games no longer open. */
  readonly predictions: readonly StartedPrediction[];
  readonly roundNames: ReadonlyMap<RoundNumber, string>;
  /** tournamentContext's current round. */
  readonly current: RoundNumber | null;
}): ResultsSummary {
  const { season, now, table, roundNames, current } = input;
  const columns = table.map(({ player, username }) => ({ player, username }));
  const context: SummaryContext = {
    season,
    columns,
    predictions: predictionsByGame(season, input.predictions),
    matchRows: new Map(
      input.rows.matches.map((row) => [
        `${row.player}/${String(row.game)}`,
        row,
      ]),
    ),
  };
  const byRound = new Map<RoundNumber, Game[]>();
  for (const game of season.games
    .filter((each) => isShown(each, now))
    .sort((a, b) => a.id - b.id)) {
    byRound.set(game.round, [...(byRound.get(game.round) ?? []), game]);
  }
  const rounds = roundOrder(byRound).map((round): SummaryRound => {
    const shown = byRound.get(round) ?? [];
    const games = shown.map((game) => summaryGame(context, game));
    const name = roundNames.get(round);
    if (name === undefined) {
      throw new Error('resultsSummary: a round without a name');
    }
    return Object.freeze({
      round,
      name,
      open: round === current || shown.some((game) => game.result === null),
      totalTenths: sumsOf(
        columns,
        games.map((game) => game.cells),
      ),
      games,
    });
  });
  return Object.freeze({
    columns,
    rounds,
    totalTenths: sumsOf(
      columns,
      rounds.flatMap((round) => round.games.map((game) => game.cells)),
    ),
  });
}
