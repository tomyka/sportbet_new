import type { MatchPrediction } from '../prediction/match-prediction';
import type { PredictionRowState } from '../prediction/predictions-list';
import { usernameOrder } from '../ranking/league-table';
import type { StoredMatchRow } from '../recalculation/recalculation';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import { countsAsBingo, isFeedBingo } from '../prediction/match-scoring';
import { isFullyCorrect, SERIJA_STEP } from '../serija/serija';
import type { GameId, PlayerId, RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';

export interface RoundProgress {
  readonly round: RoundNumber;
  readonly scored: number;
  readonly total: number;
  /** Games of the Vilnius day of `now` not yet scored ("N šiandien"). */
  readonly today: number;
}

/**
 * MainController::getTournamentProgress over the current round (R-6,
 * R-40). `vilniusDay` maps an instant to its Vilnius calendar day
 * (YYYY-MM-DD): the domain takes no time zone.
 */
export function roundProgress(input: {
  readonly season: Season;
  readonly current: RoundNumber | null;
  readonly now: Instant;
  readonly vilniusDay: (instant: Instant) => string;
}): RoundProgress | null {
  const { season, current, now, vilniusDay } = input;
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
  readonly predictions: readonly MatchPrediction[];
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

/**
 * ActivityFeedController::getFeed over the tournament's listed players
 * (sportbet issue 305: tournament-scoped). Bingos: the rows with bingo
 * points above 0 of the last three distinct scored games, newest first,
 * each game's players by name. Runs: each player's row of their last scored
 * game of the tournament whose serija bonus is at least two steps at its
 * round's rate (a run of 3 or more), by bonus over rate, longest first,
 * players equal on it by name, five at most; length = bonus / (rate x
 * step) + 1, rounded (StreakService::length).
 */
export function activityFeed(input: {
  readonly season: Season;
  readonly rows: readonly StoredMatchRow[];
  readonly listed: ReadonlySet<PlayerId>;
  readonly usernames: ReadonlyMap<PlayerId, string>;
  readonly teamName: (team: TeamId) => string;
  readonly rules: RuleSet;
}): ActivityFeed {
  const byName = usernameOrder(input.rules);
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

  const bingoGames = new Map<GameId, { game: Game; players: string[] }>();
  for (const { row, game } of scored) {
    if (!isFeedBingo(row.points)) continue;
    const entry = bingoGames.get(game.id);
    if (entry !== undefined) {
      entry.players.push(nameOf(row.player));
    } else if (bingoGames.size < FEED_BINGO_GAMES) {
      bingoGames.set(game.id, { game, players: [nameOf(row.player)] });
    }
  }
  const bingos = [...bingoGames.values()].map(({ game, players }) => {
    if (game.result === null) {
      throw new Error('activityFeed: a bingo on a game without a result');
    }
    return Object.freeze({
      game: game.id,
      line: `${input.teamName(game.home)} ${String(game.result.home)}-${String(game.result.away)} ${input.teamName(game.away)}`,
      players: players.sort(byName).join(', '),
    });
  });

  const last = new Map<PlayerId, (typeof scored)[number]>();
  for (const entry of scored) {
    if (!last.has(entry.row.player)) last.set(entry.row.player, entry);
  }
  const runs = [...last.values()].flatMap(({ row, game }) => {
    const rate = input.season.round(game.round)?.rate.value;
    if (rate === undefined) {
      throw new Error('activityFeed: a game outside its season');
    }
    // In hundredths: a step at the round's rate.
    const step = SERIJA_STEP * rate * 100;
    const bonus = row.serija.hundredths;
    if (bonus < 2 * step) return [];
    return [
      {
        username: nameOf(row.player),
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
      b.bonus * a.rate - a.bonus * b.rate || byName(a.username, b.username),
  );
  return Object.freeze({
    bingos: Object.freeze(bingos),
    runs: Object.freeze(
      runs
        .slice(0, FEED_RUNS)
        .map(({ username, length }) => Object.freeze({ username, length })),
    ),
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
  vilniusDay: (instant: Instant) => string,
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
