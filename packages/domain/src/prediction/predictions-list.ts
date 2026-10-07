import { CrowdOdds, type Vote } from '../odds/crowd-odds';
import type { Points } from '../points/points';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { Rate } from '../score/score';
import { idFromText, type GameId, type RoundNumber } from '../shared/ids';
import type { Instant } from '../shared/instant';
import type { MatchPrediction, PredictedPair } from './match-prediction';
import { winnerPointsAt } from './match-scoring';

/** The odds panel (results.blade.php): what a right call on each outcome is worth now. */
export interface OddsPanel {
  readonly home: Points;
  readonly away: Points;
  /** Never drawn for Euroleague, where a draw is no legal answer; kept for sportbet's `draw_odds`. */
  readonly draw: Points;
}

/** PointsFormat::winnerPointsAt for each outcome, at the round's rate (R-10). */
export function oddsPanel(odds: CrowdOdds, rate: Rate): OddsPanel {
  return {
    home: winnerPointsAt(odds.home, rate),
    away: winnerPointsAt(odds.away, rate),
    draw: winnerPointsAt(odds.draw, rate),
  };
}

/** How the predictions page draws a row. */
export type PredictionRowState = 'scored' | 'locked' | 'open';

/**
 * GameLock::rowIsClosed: a game with a result is drawn scored; one no
 * longer open (Game.isOpenAt: past its tip-off, locked after a move under
 * R-13, postponed under R-41) is locked; else it takes a prediction.
 */
export function predictionRowState(
  game: Game,
  now: Instant,
): PredictionRowState {
  if (game.result !== null) return 'scored';
  return game.isOpenAt(now) ? 'open' : 'locked';
}

/** The page's rounds: one, every one (R-58), or none. */
export type PredictionsRound =
  | { readonly kind: 'round'; readonly round: RoundNumber }
  | { readonly kind: 'all' }
  | { readonly kind: 'none' };

/**
 * getPredictionResultsUser's filter. `?event=` names a round by its id
 * (sportbet's event id, which the reader keeps). Absent, not a whole
 * number, or 0: the current round (LR-3, R-6, R-40), or every round when
 * none is current. An id the tournament does not have: no round, as
 * sportbet's filter by it finds no row. "all": every round (R-58; sportbet's
 * "Visi etapai" sent no id, so it fell back to the current round).
 */
export function predictionsRound(input: {
  readonly requested: string | null;
  readonly rounds: readonly {
    readonly id: number;
    readonly number: RoundNumber;
  }[];
  readonly current: RoundNumber | null;
}): PredictionsRound {
  const { requested, rounds, current } = input;
  if (requested === 'all') return { kind: 'all' };
  // Laravel's integer() is PHP's intval: leading zeros are read through.
  const id = idFromText((requested ?? '').replace(/^0+(?=\d)/u, ''));
  if (!id.ok && id.refusal === 'not-an-id') {
    return current === null
      ? { kind: 'all' }
      : { kind: 'round', round: current };
  }
  // A number past any id names no round, as one naming none does.
  const named = id.ok
    ? rounds.find((round) => round.id === id.value)
    : undefined;
  return named === undefined
    ? { kind: 'none' }
    : { kind: 'round', round: named.number };
}

/** What groupPredictionLines reads of a row. */
export interface PredictionLineKey {
  readonly game: GameId;
  readonly round: RoundNumber;
  readonly tipOff: Instant;
}

export interface PredictionDay<T> {
  /** The calendar day, as `dayOf` names it. */
  readonly day: string;
  readonly lines: readonly T[];
}

export interface PredictionRoundGroup<T> {
  readonly round: RoundNumber;
  readonly days: readonly PredictionDay<T>[];
}

/**
 * getPredictionResultsUser's grouping: by round (event_day), then by
 * calendar day as `dayOf` names it - the page passes Vilnius's - days in
 * order, then by tip-off; ties by game id.
 */
export function groupPredictionLines<T extends PredictionLineKey>(
  lines: readonly T[],
  dayOf: (instant: Instant) => string,
): PredictionRoundGroup<T>[] {
  const sorted = [...lines].sort(
    (a, b) => a.round - b.round || a.tipOff - b.tipOff || a.game - b.game,
  );
  const groups: { round: RoundNumber; days: { day: string; lines: T[] }[] }[] =
    [];
  for (const line of sorted) {
    let group = groups.at(-1);
    if (group?.round !== line.round) {
      group = { round: line.round, days: [] };
      groups.push(group);
    }
    const day = dayOf(line.tipOff);
    let current = group.days.at(-1);
    if (current?.day !== day) {
      current = { day, lines: [] };
      group.days.push(current);
    }
    current.lines.push(line);
  }
  return groups;
}

/**
 * MissingPredictions::openGamesWithoutAPrediction: the current round's
 * games still open (Game.isOpenAt) whose row of the player's lacks either
 * score. A game the player has no row for is not counted; with no
 * current round, nothing is.
 */
export function missingResultPredictions(input: {
  readonly season: Season;
  readonly current: RoundNumber | null;
  readonly predictions: readonly MatchPrediction[];
  readonly now: Instant;
}): number {
  const { season, current, predictions, now } = input;
  if (current === null) return 0;
  return predictions.filter((prediction) => {
    const game = season.game(prediction.game);
    return (
      game?.round === current &&
      game.isOpenAt(now) &&
      (prediction.home === null || prediction.away === null)
    );
  }).length;
}

/** One of the player's rows the page shows, before its points and odds are read. */
export interface ShownPrediction {
  readonly game: Game;
  readonly predicted: PredictedPair;
  readonly state: PredictionRowState;
}

/**
 * getPredictionResultsUser's filter: the player's rows (`rows`, each of a
 * game of the season) in the chosen round, or every round (R-58), or none;
 * in the order given, each with its game and its state
 * (predictionRowState). A row of a game the season does not have is an
 * impossible state and throws.
 */
export function shownPredictions(input: {
  readonly season: Season;
  readonly rows: readonly (PredictedPair & { readonly game: GameId })[];
  readonly chosen: PredictionsRound;
  readonly now: Instant;
}): readonly ShownPrediction[] {
  const { season, rows, chosen, now } = input;
  if (chosen.kind === 'none') return [];
  return rows.flatMap((row) => {
    const game = season.game(row.game);
    if (game === undefined) {
      throw new Error(
        `shownPredictions: game ${String(row.game)} is not in the season`,
      );
    }
    if (chosen.kind === 'round' && game.round !== chosen.round) return [];
    return [
      {
        game,
        predicted: { home: row.home, away: row.away },
        state: predictionRowState(game, now),
      },
    ];
  });
}

/** A shown row with what the page draws beside it. */
export interface PredictionLineOf<P> extends ShownPrediction {
  /** On a scored line, its points row (`points`), if it has one. */
  readonly points: P | null;
  /** On any other line, the odds panel from its game's votes now. */
  readonly panel: OddsPanel | null;
}

/**
 * The page's lines: a scored line gets its points row and no panel; any
 * other gets the odds panel from its game's votes now
 * (CrowdOdds.forGame), at its round's rate (R-10) - odds are read, never
 * stored (CO-7). The points are the caller's (stored rows of the rule
 * set's source), so their shape is too.
 */
export function predictionLinesOf<P>(input: {
  readonly shown: readonly ShownPrediction[];
  readonly season: Season;
  readonly points: ReadonlyMap<GameId, P>;
  readonly votes: ReadonlyMap<GameId, readonly Vote[]>;
  readonly rules: RuleSet;
}): readonly PredictionLineOf<P>[] {
  const { shown, season, points, votes, rules } = input;
  return shown.map((line) => {
    if (line.state === 'scored') {
      return { ...line, points: points.get(line.game.id) ?? null, panel: null };
    }
    const round = season.round(line.game.round);
    if (round === undefined) {
      throw new Error(
        `predictionLinesOf: round ${String(line.game.round)} is not in the season`,
      );
    }
    return {
      ...line,
      points: null,
      panel: oddsPanel(
        CrowdOdds.forGame(votes.get(line.game.id) ?? [], rules),
        round.rate,
      ),
    };
  });
}
