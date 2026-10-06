import type { CrowdOdds } from '../odds/crowd-odds';
import type { Points } from '../points/points';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { Rate } from '../score/score';
import type { GameId, RoundNumber } from '../shared/ids';
import type { Instant } from '../shared/instant';
import type { MatchPrediction } from './match-prediction';
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

const WHOLE = /^\d{1,10}$/u;

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
  const id =
    requested !== null && WHOLE.test(requested) ? Number(requested) : 0;
  if (id === 0) {
    return current === null
      ? { kind: 'all' }
      : { kind: 'round', round: current };
  }
  const named = rounds.find((round) => round.id === id);
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
