import { gameOddsHundredths } from '../odds/crowd-ratio';
import { oddsOfHundredths } from '../points/odds';
import { Rate, Score } from '../score/score';
import { PREDICTION_MAX, PREDICTION_MIN } from './match-prediction';
import { marginParts, winnerPointsAt } from './match-scoring';

export interface MarginExample {
  readonly actual: { readonly home: number; readonly away: number };
  readonly predicted: { readonly home: number; readonly away: number };
  /** How far the called margin is from the result's. */
  readonly miss: number;
  /** The margin rule alone, 50 less the slope times the miss (below zero when far off), in hundredths. */
  readonly pointsHundredths: number;
  /** The one bonus the row earns on top, in hundredths: bingo for the exact score, else the exact margin's. */
  readonly bonusHundredths: number;
  readonly exactScore: boolean;
}

export interface OddsExample {
  readonly chose: number;
  readonly total: number;
  /** The share of the crowd, a whole percent, half up. */
  readonly share: number;
  /** The two-place odds `game_odds` stores, in hundredths. */
  readonly oddsHundredths: number;
  /** The winner points at those odds in a round at rate 1, in hundredths. */
  readonly winnerPointsHundredths: number;
}

/**
 * sportbet's worked inputs (ScoringRules): a crowd of 30 players and 28, 15,
 * 10, 3 and 1 of them choosing the outcome (ODDS_EXAMPLE_TOTAL, _SHARES).
 */
const ODDS_EXAMPLE_TOTAL = 30;
const ODDS_EXAMPLE_CHOSE = [28, 15, 10, 3, 1] as const;

const RATE_ONE = (() => {
  const rate = Rate.of(1);
  if (!rate.ok)
    throw new Error('publishedMatchFigures: a rate of 1 is refused');
  return rate.value;
})();

function scoreOf(home: number, away: number): Score {
  const score = Score.of(home, away);
  if (!score.ok) {
    throw new Error('publishedMatchFigures: a worked example is no score');
  }
  return score.value;
}

/**
 * ScoringRules::marginExamples: a game around the middle of the entry range,
 * called exactly, with the exact margin but not the score, narrowly, the wrong
 * way round, and wildly.
 */
function marginExamples(): readonly MarginExample[] {
  const middle = Math.floor((PREDICTION_MIN + PREDICTION_MAX) / 2);
  const actual = { home: middle + 3, away: middle - 6 };
  const calls = [
    actual,
    { home: actual.home + 4, away: actual.away + 4 },
    { home: middle, away: middle - 5 },
    { home: actual.away, away: actual.home },
    { home: PREDICTION_MIN + 10, away: PREDICTION_MAX - 5 },
  ];
  const result = scoreOf(actual.home, actual.away);
  return calls.map((predicted) => {
    const parts = marginParts(predicted, result);
    return {
      actual,
      predicted,
      miss: parts.miss,
      pointsHundredths: parts.marginRule.hundredths,
      bonusHundredths:
        parts.exactMarginBonus.hundredths + parts.bingo.hundredths,
      exactScore: parts.bingo.hundredths !== 0,
    };
  });
}

/** ScoringRules::oddsExamples: what the winner bonus pays at five crowd sizes. */
function oddsExamples(): readonly OddsExample[] {
  return ODDS_EXAMPLE_CHOSE.map((chose) => {
    const hundredths = gameOddsHundredths(ODDS_EXAMPLE_TOTAL, chose);
    return {
      chose,
      total: ODDS_EXAMPLE_TOTAL,
      // Whole percent, half up, in integers.
      share: Math.floor(
        (chose * 200 + ODDS_EXAMPLE_TOTAL) / (2 * ODDS_EXAMPLE_TOTAL),
      ),
      oddsHundredths: hundredths,
      winnerPointsHundredths: winnerPointsAt(
        oddsOfHundredths(hundredths),
        RATE_ONE,
      ).hundredths,
    };
  });
}

/**
 * The match scoring's worked examples on /rules (slice 18, #35, R-100): the
 * margin table and the odds table, scored by the scorers themselves
 * (`marginParts`, `winnerPointsAt`), so the page cannot drift from scoring.

 */
export function publishedMatchFigures(): {
  readonly marginExamples: readonly MarginExample[];
  readonly oddsExamples: readonly OddsExample[];
} {
  return {
    marginExamples: marginExamples(),
    oddsExamples: oddsExamples(),
  };
}
