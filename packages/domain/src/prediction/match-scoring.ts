import type { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
import { Points, pointsOfHundredths, pointsWhole } from '../points/points';
import type { Game } from '../round/game';
import type { Round } from '../round/round';
import type { TeamId } from '../shared/ids';
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
  /** Always 0 (MS-7, sportbet #215): the odds are inside the winner points. */
  readonly oddsPoints: Points;
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
  const predicted = prediction.outcome;
  const result = game.result;
  if (
    predicted === null ||
    prediction.home === null ||
    prediction.away === null
  ) {
    return null;
  }
  if (result === null) {
    return null;
  }
  // A fill-in's odds count as 0 (FI-3, R-1); a real call uses the odds of
  // the outcome it predicted, right or wrong (MS-4).
  const callOdds =
    prediction.origin === 'real' ? crowd.forOutcome(predicted) : Odds.ZERO;
  const exact =
    prediction.home === result.home && prediction.away === result.away;
  // MS-6, R-42: one bonus or the other, never both. The sign counts: 85-90
  // on a 90-85 result has the margin's size, not the margin.
  const marginMiss = Math.abs(
    prediction.home - prediction.away - result.margin(),
  );
  const exactMarginBonus =
    marginMiss === 0 && !exact ? EUROLEAGUE_POINTS.exactMarginBonus : 0;
  const margin = pointsWhole(
    EUROLEAGUE_POINTS.marginBase - marginMiss + exactMarginBonus,
  );
  const bingo = exact ? pointsWhole(EUROLEAGUE_POINTS.bingo) : Points.ZERO;

  let winner: Points;
  let odds: Odds;
  let rightRoute: boolean;
  if (!round.knockout) {
    rightRoute = predicted === result.outcome();
    winner = rightRoute
      ? oddsBonus(callOdds, EUROLEAGUE_POINTS.winnerBonus)
      : Points.ZERO;
    odds = callOdds;
  } else {
    // MS-8, MS-10: sportbet's knockout rule. A prediction is never level, so
    // naming the team that went through is the whole call, except when the
    // admin saved a level result with a recorded winner: then the right
    // team by the wrong route earns half credit at the draw odds.
    const predictedTeam: TeamId = predicted === 'home' ? game.home : game.away;
    const through = result.isLevel() ? game.recordedWinner : game.winner();
    const namedTheTeam = through !== null && through === predictedTeam;
    rightRoute = namedTheTeam && !result.isLevel();
    if (rightRoute) {
      winner = oddsBonus(callOdds, EUROLEAGUE_POINTS.winnerBonus);
      odds = callOdds;
    } else if (namedTheTeam) {
      odds = crowd.forOutcome('level');
      winner = oddsBonus(odds, EUROLEAGUE_POINTS.partialWinnerBonus);
    } else {
      winner = Points.ZERO;
      odds = Odds.ZERO;
    }
  }

  const rate = round.rate.value;
  const rated = {
    winner: winner.times(rate),
    margin: margin.times(rate),
    bingo: bingo.times(rate),
  };
  return Object.freeze({
    ...rated,
    oddsPoints: Points.ZERO,
    full: rated.winner.plus(rated.margin).plus(rated.bingo),
    odds,
    extendsSerija:
      prediction.origin === 'real' && rightRoute && rated.winner.isPositive(),
  });
}
