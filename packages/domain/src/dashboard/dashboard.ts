import type { MatchPrediction } from '../prediction/match-prediction';
import type {
  OddsPanel,
  PredictionRowState,
} from '../prediction/predictions-list';
import type { PredictedPair } from '../prediction/match-prediction';
import { usernameOrder } from '../ranking/league-table';
import type { StoredMatchRow } from '../recalculation/recalculation';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import { countsAsBingo, isFeedBingo } from '../prediction/match-scoring';
import { isFullyCorrect, SERIJA_STEP } from '../serija/serija';
import type { GameId, PlayerId, RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { vilniusDay } from '../shared/vilnius-day';

export interface RoundProgress {
  readonly round: RoundNumber;
  readonly scored: number;
  readonly total: number;
  /** Games of the Vilnius day of `now` not yet scored ("N šiandien"). */
  readonly today: number;
}

/**
 * MainController::getTournamentProgress over the current round (R-6,
 * R-40); "today" is the Vilnius day of `now` (vilniusDay).
 */
export function roundProgress(input: {
  readonly season: Season;
  readonly current: RoundNumber | null;
  readonly now: Instant;
}): RoundProgress | null {
  const { season, current, now } = input;
  if (current === null) return null;
  const games = season.games.filter((game) => game.round === current);
  const today = vilniusDay(now);
  return Object.freeze({
    round: current,
    scored: games.filter((game) => game.result !== null).length,
    total: games.length,
    today: games.filter(
      (game) => game.result === null && vilniusDay(game.tipOff) === today,
    ).length,
  });
}

export interface StatTiles {
  readonly bingo: number;
  readonly serija: number;
}

const newestFirst = (a: Game, b: Game): number =>
  b.tipOff - a.tipOff || b.id - a.id;

/** The season's game a points row belongs to; another's is impossible. */
function gameOf(season: Season, row: StoredMatchRow, caller: string): Game {
  const game = season.game(row.game);
  if (game === undefined) {
    throw new Error(`${caller}: a points row of a game not in the season`);
  }
  return game;
}

/**
 * MainController::getSnapshotData's bingo and serija tiles over one
 * player's points rows of the tournament (R-71: never another's). Bingo:
 * the rows that count as one (countsAsBingo). Serija: the player's scored
 * games with a row, newest first, while each is fully correct
 * (isFullyCorrect). Null without a row of a scored game, as sportbet draws
 * no tiles then.
 */
export function statTiles(input: {
  readonly season: Season;
  readonly rows: readonly StoredMatchRow[];
  /** The player's predictions' origins (a MatchPrediction is one). */
  readonly predictions: readonly Pick<MatchPrediction, 'game' | 'origin'>[];
}): StatTiles | null {
  const origin = new Map(input.predictions.map((p) => [p.game, p.origin]));
  const scored = input.rows
    .map((row) => ({ row, game: gameOf(input.season, row, 'statTiles') }))
    .filter(({ game }) => game.result !== null)
    .sort((a, b) => newestFirst(a.game, b.game));
  if (scored.length === 0) return null;
  let serija = 0;
  for (const { row } of scored) {
    if (!isFullyCorrect(row.points.winner, origin.get(row.game) ?? null)) {
      break;
    }
    serija++;
  }
  return Object.freeze({
    bingo: input.rows.filter((row) => countsAsBingo(row.points)).length,
    serija,
  });
}

export interface FeedBingo {
  readonly game: GameId;
  /** "ZAL 88-79 OLY": the teams' names and the result. */
  readonly line: string;
  /** The usernames, by name, joined with ", ". */
  readonly players: string;
}

export interface FeedRun {
  readonly username: string;
  /** The run's length (StreakService::length). */
  readonly length: number;
}

export interface ActivityFeed {
  readonly bingos: readonly FeedBingo[];
  readonly runs: readonly FeedRun[];
}

/** How many games of bingos and runs the feed shows (ActivityFeedController). */
const FEED_BINGO_GAMES = 3;
const FEED_RUNS = 5;

/** A listed player's row of a scored game, newest first: what the feed reads. */
interface ScoredRow {
  readonly row: StoredMatchRow;
  readonly game: Game;
}

/** What both halves of the feed read. */
interface FeedContext {
  readonly scored: readonly ScoredRow[];
  readonly season: Season;
  readonly nameOf: (player: PlayerId) => string;
  readonly teamName: (team: TeamId) => string;
  readonly byName: (a: string, b: string) => number;
}

/**
 * The bingos: the rows with bingo points above 0 of the last three
 * distinct scored games, newest first, each game's players by name.
 */
function feedBingos(feed: FeedContext): FeedBingo[] {
  const bingoGames = new Map<GameId, { game: Game; players: string[] }>();
  for (const { row, game } of feed.scored) {
    if (!isFeedBingo(row.points)) continue;
    const entry = bingoGames.get(game.id);
    if (entry !== undefined) {
      entry.players.push(feed.nameOf(row.player));
    } else if (bingoGames.size < FEED_BINGO_GAMES) {
      bingoGames.set(game.id, { game, players: [feed.nameOf(row.player)] });
    }
  }
  return [...bingoGames.values()].map(({ game, players }) => {
    if (game.result === null) {
      throw new Error('activityFeed: a bingo on a game without a result');
    }
    return Object.freeze({
      game: game.id,
      line: `${feed.teamName(game.home)} ${String(game.result.home)}-${String(game.result.away)} ${feed.teamName(game.away)}`,
      players: players.sort(feed.byName).join(', '),
    });
  });
}

/**
 * The runs: each player's row of their last scored game whose serija bonus
 * is at least two steps at its round's rate (a run of 3 or more), by bonus
 * over rate, longest first, players equal on it by name, five at most;
 * length = bonus / (rate x step) + 1, rounded (StreakService::length).
 */
function feedRuns(feed: FeedContext): FeedRun[] {
  const last = new Map<PlayerId, ScoredRow>();
  for (const entry of feed.scored) {
    if (!last.has(entry.row.player)) last.set(entry.row.player, entry);
  }
  const runs = [...last.values()].flatMap(({ row, game }) => {
    const rate = feed.season.round(game.round)?.rate.value;
    if (rate === undefined) {
      throw new Error('activityFeed: a game outside its season');
    }
    // In hundredths: a step at the round's rate.
    const step = SERIJA_STEP * rate * 100;
    const bonus = row.serija.hundredths;
    if (bonus < 2 * step) return [];
    return [
      {
        username: feed.nameOf(row.player),
        bonus,
        rate,
        // round(bonus / step) + 1, half up, in whole numbers.
        length: Math.floor((2 * bonus + step) / (2 * step)) + 1,
      },
    ];
  });
  // By bonus / rate, descending, compared as whole numbers.
  runs.sort(
    (a, b) =>
      b.bonus * a.rate - a.bonus * b.rate ||
      feed.byName(a.username, b.username),
  );
  return runs
    .slice(0, FEED_RUNS)
    .map(({ username, length }) => Object.freeze({ username, length }));
}

/**
 * ActivityFeedController::getFeed over the tournament's listed players
 * (sportbet issue 305: tournament-scoped): its bingos (feedBingos) and
 * runs (feedRuns).
 */
export function activityFeed(input: {
  readonly season: Season;
  readonly rows: readonly StoredMatchRow[];
  readonly listed: ReadonlySet<PlayerId>;
  readonly usernames: ReadonlyMap<PlayerId, string>;
  readonly teamName: (team: TeamId) => string;
  readonly rules: RuleSet;
}): ActivityFeed {
  const nameOf = (player: PlayerId): string => {
    const name = input.usernames.get(player);
    if (name === undefined) {
      throw new Error('activityFeed: a listed player without a username');
    }
    return name;
  };
  const scored = input.rows
    .filter(({ player }) => input.listed.has(player))
    .map((row) => ({ row, game: gameOf(input.season, row, 'activityFeed') }))
    .filter(({ game }) => game.result !== null)
    .sort((a, b) => newestFirst(a.game, b.game));
  const feed: FeedContext = {
    scored,
    season: input.season,
    nameOf,
    teamName: input.teamName,
    byName: usernameOrder(input.rules),
  };
  return Object.freeze({
    bingos: Object.freeze(feedBingos(feed)),
    runs: Object.freeze(feedRuns(feed)),
  });
}

/** How many Vilnius days the game page's games cover (MainController). */
const DECK_DAYS = 3;

/**
 * MainController::loadApp's games, for "Artimiausios rungtynės" and
 * "Visos rungtynės" alike: the current round's lines by tip-off then id,
 * a played game of a Vilnius day before today's dropped, then the games
 * of the first three Vilnius days left. Each says whether its card offers
 * "Spėti": only an open game does; a started or played one shows nothing
 * (R-75; sportbet's "Keisti").
 */
export function fixtureDeck<
  T extends {
    readonly game: GameId;
    readonly tipOff: Instant;
    readonly state: PredictionRowState;
  },
>(
  lines: readonly T[],
  now: Instant,
): readonly (T & { readonly predict: boolean })[] {
  const today = vilniusDay(now);
  const kept = [...lines]
    .sort((a, b) => a.tipOff - b.tipOff || a.game - b.game)
    .filter(
      (line) => line.state !== 'scored' || vilniusDay(line.tipOff) >= today,
    );
  const days = new Set(
    [...new Set(kept.map((line) => vilniusDay(line.tipOff)))].slice(
      0,
      DECK_DAYS,
    ),
  );
  return Object.freeze(
    kept
      .filter((line) => days.has(vilniusDay(line.tipOff)))
      .map((line) =>
        Object.freeze({ ...line, predict: line.state === 'open' }),
      ),
  );
}

/**
 * The odds a game page row shows (R-61; games.blade.php's `hasRowOdds`):
 * its panel when the game is not played and both scores are predicted;
 * else none.
 */
export function gameOdds(line: {
  readonly state: PredictionRowState;
  readonly predicted: PredictedPair;
  readonly panel: OddsPanel | null;
}): OddsPanel | null {
  const typed = line.predicted.home !== null && line.predicted.away !== null;
  return line.state !== 'scored' && typed ? line.panel : null;
}
