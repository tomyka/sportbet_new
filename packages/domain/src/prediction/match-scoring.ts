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
 * 1ac955f).
 */
export const EUROLEAGUE_POINTS = Object.freeze({
  winnerBonus: 50,
  partialWinnerBonus: 25,
  marginBase: 50,
});

/**
 * R-138, the scoring balance, published on /rules: the slope of the margin
 * rule (MS-6, `base - slope x |error|`), the exact-margin bonus and the
 * bingo (R-42: the exact score pays the bingo, the exact margin without it
 * the bonus instead, inside the margin points), in whole points before the
 * round's rate.
 */
export const SCORING_BALANCE = Object.freeze({
  differenceSlope: 2,
  exactDifferenceBonus: 30,
  exactScoreBonus: 100,
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

/** What the margin table shows of a call against a result, before the round's rate. */
export interface MarginParts {
  /** How far the called margin is from the result's, sign counted. */
  readonly miss: number;
  /** The margin rule: the base less the miss, below zero when far off (MS-6). */
  readonly marginRule: Points;
  /** R-42: the exact margin without the exact score. */
  readonly exactMarginBonus: Points;
  /** R-42: the exact score. */
  readonly bingo: Points;
}

/**
 * MS-5, MS-6, R-42: the margin rule, the exact-margin bonus and the exact
 * score's bingo - the bonus or the bingo, never both. The sign counts: 85-90
 * on a 90-85 result has the margin's size, not the margin. The slope, the
 * bonus and the bingo are SCORING_BALANCE's (R-138). scoreMatch sums the rule
 * and the bonus into the margin; the rules page shows the parts (internal to
 * the domain, like scoreMatch).
 */
export function marginParts(
  call: { readonly home: number; readonly away: number },
  result: Score,
): MarginParts {
  const exact = call.home === result.home && call.away === result.away;
  const miss = Math.abs(call.home - call.away - result.margin());
  return {
    miss,
    marginRule: pointsWhole(
      EUROLEAGUE_POINTS.marginBase - SCORING_BALANCE.differenceSlope * miss,
    ),
    exactMarginBonus: pointsWhole(
      miss === 0 && !exact ? SCORING_BALANCE.exactDifferenceBonus : 0,
    ),
    bingo: exact ? pointsWhole(SCORING_BALANCE.exactScoreBonus) : Points.ZERO,
  };
}

function marginAndBingo(
  call: AnsweredCall,
  result: Score,
): { readonly margin: Points; readonly bingo: Points } {
  const parts = marginParts(call, result);
  return {
    margin: parts.marginRule.plus(parts.exactMarginBonus),
    bingo: parts.bingo,
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

/** What a game is scored with: its crowd odds. */
export interface ScoringBasis {
  readonly crowd: CrowdOdds;
}

/**
 * MS-2 to MS-10, FI-3. Null when there is nothing to score: an
 * unanswered prediction (MS-2) or a game without a result (LR-5).
 */
export function scoreMatch(
  prediction: MatchPrediction,
  game: Game,
  round: Round,
  basis: ScoringBasis,
): MatchPoints | null {
  const { crowd } = basis;
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
 * thresholdPerFormat: `bingo_points >=` Euroleague's 50; R-138: 100).
 */
export function isExactScore(points: { readonly bingo: Points }): boolean {
  return points.bingo.hundredths >= SCORING_BALANCE.exactScoreBonus * 100;
}
