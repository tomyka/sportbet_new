import type { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
import { Points, pointsOfHundredths, pointsWhole } from '../points/points';
import type { Game } from '../round/game';
import type { Round } from '../round/round';
import type { Outcome, Rate, Score } from '../score/score';
import type { TeamId } from '../shared/ids';
import { isFullyCorrect } from '../serija/serija';
import type { MatchPrediction } from './match-prediction';

/**
 * Euroleague's match scoring constants (sportbet config/points.php at
 * 1ac955f). R-42 (sportbet #291), in both rule sets: the exact score pays
 * `bingo`; the exact margin without it pays `exactMarginBonus` instead,
 * inside the margin points.
 */
export const EUROLEAGUE_POINTS = Object.freeze({
  winnerBonus: 50,
  partialWinnerBonus: 25,
  bingo: 50,
  marginBase: 50,
  exactMarginBonus: 20,
});

/**
 * One prediction's points for one game, as sportbet stores the row: each
 * component already multiplied by the round's rate, and their sum.
 */
export interface MatchPoints {
  readonly winner: Points;
  /**
   * sportbet's `difference_points`: the margin rule, plus the exact-margin
   * bonus when the margin is exact and the score is not (MS-6, R-42).
   */
  readonly margin: Points;
  /** The exact score's bonus only (MS-6); never the exact-margin bonus. */
  readonly bingo: Points;
  /**
   * The sum. No odds points (MS-7, sportbet #215): the odds are inside the
   * winner points, and sportbet 5de13bd dropped the always-zero column.
   */
  readonly full: Points;
  /** The odds stored on the row (MS-4, MS-8). */
  readonly odds: Odds;
  /** A real call that named the winner by the right route (SE-1). */
  readonly extendsSerija: boolean;
}

/** (1 + odds) x bonus, in hundredths. */
function oddsBonus(odds: Odds, bonus: number): Points {
  return pointsOfHundredths((100 + odds.hundredths) * bonus);
}

/**
 * What a right call is worth at `odds` in a round at `rate`, before the
 * result: PointsFormat::winnerPointsAt, the predictions page's odds panel.
 * The (1 + odds) x winner bonus scoreMatch pays, times the rate.
 */
export function winnerPointsAt(odds: Odds, rate: Rate): Points {
  return oddsBonus(odds, EUROLEAGUE_POINTS.winnerBonus).times(rate.value);
}

/** A prediction with both scores, as scoreMatch scores it. */
interface AnsweredCall {
  readonly home: number;
  readonly away: number;
  readonly predicted: Outcome;
  /** The odds the call is paid at: its own outcome's, 0 for a fill-in. */
  readonly callOdds: Odds;
}

/** The winner part of a call: its points, the odds stored, the route. */
interface WinnerCall {
  readonly winner: Points;
  readonly odds: Odds;
  /** The call named the winner by the right route (SE-1). */
  readonly rightRoute: boolean;
}

/**
 * MS-5, MS-6, R-42: the margin points and the exact score's bingo - one
 * bonus or the other, never both. The sign counts: 85-90 on a 90-85
 * result has the margin's size, not the margin.
 */
function marginAndBingo(
  call: AnsweredCall,
  result: Score,
): { readonly margin: Points; readonly bingo: Points } {
  const exact = call.home === result.home && call.away === result.away;
  const marginMiss = Math.abs(call.home - call.away - result.margin());
  const exactMarginBonus =
    marginMiss === 0 && !exact ? EUROLEAGUE_POINTS.exactMarginBonus : 0;
  return {
    margin: pointsWhole(
      EUROLEAGUE_POINTS.marginBase - marginMiss + exactMarginBonus,
    ),
    bingo: exact ? pointsWhole(EUROLEAGUE_POINTS.bingo) : Points.ZERO,
  };
}

/** MS-3, MS-4: a regular round pays the right outcome at its odds. */
function regularWinner(call: AnsweredCall, result: Score): WinnerCall {
  const rightRoute = call.predicted === result.outcome();
  return {
    winner: rightRoute
      ? oddsBonus(call.callOdds, EUROLEAGUE_POINTS.winnerBonus)
      : Points.ZERO,
    odds: call.callOdds,
    rightRoute,
  };
}

/**
 * MS-8, MS-10: sportbet's knockout rule. A prediction is never level, so
 * naming the team that went through is the whole call, except when the
 * admin saved a level result with a recorded winner: then the right team
 * by the wrong route earns half credit at the draw odds.
 */
function knockoutWinner(
  call: AnsweredCall,
  game: Game,
  result: Score,
  crowd: CrowdOdds,
): WinnerCall {
  const predictedTeam: TeamId =
    call.predicted === 'home' ? game.home : game.away;
  const through = result.isLevel() ? game.recordedWinner : game.winner();
  const namedTheTeam = through !== null && through === predictedTeam;
  if (namedTheTeam && !result.isLevel()) {
    return {
      winner: oddsBonus(call.callOdds, EUROLEAGUE_POINTS.winnerBonus),
      odds: call.callOdds,
      rightRoute: true,
    };
  }
  if (namedTheTeam) {
    const odds = crowd.forOutcome('level');
    return {
      winner: oddsBonus(odds, EUROLEAGUE_POINTS.partialWinnerBonus),
      odds,
      rightRoute: false,
    };
  }
  return { winner: Points.ZERO, odds: Odds.ZERO, rightRoute: false };
}

/**
 * The prediction as a call to score, or null when it is unanswered (MS-2).
 * A fill-in's odds count as 0 (FI-3, R-1); a real call uses the odds of
 * the outcome it predicted, right or wrong (MS-4).
 */
function answeredCall(
  prediction: MatchPrediction,
  crowd: CrowdOdds,
): AnsweredCall | null {
  const predicted = prediction.outcome;
  if (
    predicted === null ||
    prediction.home === null ||
    prediction.away === null
  ) {
    return null;
  }
  return {
    home: prediction.home,
    away: prediction.away,
    predicted,
    callOdds:
      prediction.origin === 'real' ? crowd.forOutcome(predicted) : Odds.ZERO,
  };
}

/**
 * MS-2 to MS-10, FI-3, CO-5. Null when there is nothing to score: an
 * unanswered prediction (MS-2) or a game without a result (LR-5).
 */
export function scoreMatch(
  prediction: MatchPrediction,
  game: Game,
  round: Round,
  crowd: CrowdOdds,
): MatchPoints | null {
  if (prediction.game !== game.id || game.round !== round.number) {
    throw new Error('scoreMatch: the prediction, game and round do not match');
  }
  const call = answeredCall(prediction, crowd);
  const result = game.result;
  if (call === null || result === null) {
    return null;
  }
  const { margin, bingo } = marginAndBingo(call, result);
  const { winner, odds, rightRoute } = round.knockout
    ? knockoutWinner(call, game, result, crowd)
    : regularWinner(call, result);
  const rate = round.rate.value;
  const rated = {
    winner: winner.times(rate),
    margin: margin.times(rate),
    bingo: bingo.times(rate),
  };
  return Object.freeze({
    ...rated,
    full: rated.winner.plus(rated.margin).plus(rated.bingo),
    odds,
    extendsSerija:
      rightRoute && isFullyCorrect(rated.winner, prediction.origin),
  });
}

/**
 * Three pages count a correct score three ways, each as sportbet does.
 * countsAsBingo: the league table's "Bingo taškai" and the game page's
 * "bingo" tile - any bingo points other than 0
 * (PointResultController::getBulkUserGamePoints, `bingo_points != 0`).
 */
export function countsAsBingo(points: { readonly bingo: Points }): boolean {
  return points.bingo.hundredths !== 0;
}

/** The activity feed's bingos: bingo points above 0 (ActivityFeedController::getBingos). */
export function isFeedBingo(points: { readonly bingo: Points }): boolean {
  return points.bingo.hundredths > 0;
}

/**
 * The leaderboard's "Tikslūs": bingo points of at least the format's bingo,
 * whatever the round's rate (MainController::leaderboard,
 * thresholdPerFormat: `bingo_points >=` Euroleague's 50).
 */
export function isExactScore(points: { readonly bingo: Points }): boolean {
  return points.bingo.hundredths >= EUROLEAGUE_POINTS.bingo * 100;
}
