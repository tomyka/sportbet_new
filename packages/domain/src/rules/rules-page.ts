import { gameOddsHundredths } from '../odds/crowd-ratio';
import { oddsOfHundredths } from '../points/odds';
import { PREDICTION_MAX, PREDICTION_MIN } from '../prediction/match-prediction';
import {
  EUROLEAGUE_POINTS,
  marginParts,
  winnerPointsAt,
} from '../prediction/match-scoring';
import { STAGES } from '../round/stage';
import { Rate, Score } from '../score/score';
import { SERIJA_STEP, serijaBonus } from '../serija/serija';
import { STANDINGS_COUNTS } from '../standings/standings-prediction';
import {
  finalPoints,
  placePoints,
  STANDINGS_POINTS,
} from '../standings/standings-scoring';
import type { StandingsCloses } from '../standings/standings-view';
import type { RuleSet } from './rule-set';

/** What /rules states of the tournament it describes; null where there is none. */
export interface RulesFacts {
  readonly teamCount: number | null;
  readonly deadlineRound: number | null;
  readonly standingsCloses: StandingsCloses | null;
}

export interface MarginExample {
  readonly actual: { readonly home: number; readonly away: number };
  readonly predicted: { readonly home: number; readonly away: number };
  /** How far the called margin is from the result's. */
  readonly miss: number;
  /** The margin rule alone, 50 less the miss (below zero when far off). */
  readonly points: number;
  /** The one bonus the row earns on top: bingo for the exact score, else the exact margin's. */
  readonly bonus: number;
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

export interface SerijaExample {
  readonly run: number;
  readonly bonus: number;
}

export interface PlaceExample {
  readonly miss: number;
  readonly points: number;
  /** "N or more": the row has reached the floor, where every further miss pays 0. */
  readonly last: boolean;
}

export interface BracketRow {
  readonly stage: 'playOffs' | 'finalFour';
  readonly points: number;
  readonly count: number;
}

/** Every figure and rule-dependent line of /rules (slice 18, #35, R-100). */
export interface RulesPage {
  readonly tiles: {
    readonly winnerBonus: number;
    readonly marginBase: number;
    readonly bingo: number;
    readonly exactMargin: number;
    /** What each later call of a run adds: the tile reads "+(N-1)xstep" (R-106). */
    readonly serijaStep: number;
    /** The stage rates, distinct, in stage order (R-10): "x1 / x2" under sportbet's set. */
    readonly rates: readonly number[];
  };
  readonly bounds: {
    readonly min: number;
    readonly max: number;
    readonly drawsAllowed: false;
  };
  readonly marginExamples: readonly MarginExample[];
  readonly oddsExamples: readonly OddsExample[];
  /** R-2: only real predictions count toward the crowd odds. */
  readonly oddsCountRealOnly: boolean;
  readonly serijaExamples: readonly SerijaExample[];
  /** R-106: a run follows kick-off order (walkSerija). */
  readonly serijaOrder: 'tip-off';
  /** R-7, R-32: the missed games after which a player is switched off. */
  readonly switchOffAfterMisses: number;
  readonly placeExamples: readonly PlaceExample[];
  /** The rule keeps falling past the last row drawn. */
  readonly placesContinue: boolean;
  readonly placeStep: number;
  /** The table runs 1 to this; null with no tournament. */
  readonly teamCount: number | null;
  readonly bracket: readonly BracketRow[];
  /** [predicted][actual] over places 1 and 2. */
  readonly finalsGrid: readonly (readonly number[])[];
  readonly deadlineRound: number | null;
  readonly standingsCloses: StandingsCloses | null;
}

/**
 * sportbet's worked inputs (ScoringRules): a crowd of 30 players and 28, 15,
 * 10, 3 and 1 of them choosing the outcome (ODDS_EXAMPLE_TOTAL, _SHARES).
 */
const ODDS_EXAMPLE_TOTAL = 30;
const ODDS_EXAMPLE_CHOSE = [28, 15, 10, 3, 1] as const;

/** The places a Euroleague final awards (STANDINGS_COUNTS.finalPlaces). */
const FINAL_PLACES = [1, 2] as const;

/** The most places a miss is listed for, then "continues" (GRID_MAX_MISS). */
const PLACE_MISS_ROWS = 7;

const RATE_ONE = (() => {
  const rate = Rate.of(1);
  if (!rate.ok) throw new Error('rulesPage: a rate of 1 is refused');
  return rate.value;
})();

function scoreOf(home: number, away: number): Score {
  const score = Score.of(home, away);
  if (!score.ok) throw new Error('rulesPage: a worked example is no score');
  return score.value;
}

/** The distinct stage rates in stage order, or sportbet's two when the set fixes none (R-10). */
function ratesOf(rules: RuleSet): readonly number[] {
  if (rules.stageRates === null) return [1, 2];
  const rates = STAGES.map((stage) => rules.stageRates?.[stage]);
  return [
    ...new Set(rates.filter((rate): rate is number => rate !== undefined)),
  ];
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
      points: parts.marginRule.hundredths / 100,
      bonus: (parts.exactMarginBonus.hundredths + parts.bingo.hundredths) / 100,
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

/** ScoringRules::positionMissExamples: how far out, what it pays, down to the floor or seven. */
function placeExamples(): readonly PlaceExample[] {
  const anchor = 1;
  let rows = 0;
  while (rows < PLACE_MISS_ROWS && placePoints(anchor + rows, anchor) > 0) {
    rows += 1;
  }
  return Array.from({ length: rows + 1 }, (_, miss) => {
    const points = placePoints(anchor + miss, anchor);
    return { miss, points, last: miss === rows && points === 0 };
  });
}

/**
 * Every figure and rule-dependent line of /rules, from the same scorers that
 * recalculateTournament uses (marginParts, serijaBonus, placePoints,
 * finalPoints, gameOddsHundredths, winnerPointsAt) and their constants, so
 * the page cannot drift from scoring (R-100). sportbet's fixed example
 * inputs are named constants. The tournament's facts are null where there is
 * no tournament to describe.
 */
export function rulesPage(rules: RuleSet, facts: RulesFacts): RulesPage {
  const places = placeExamples();
  const last = places.at(-1);
  const page: RulesPage = {
    tiles: {
      winnerBonus: EUROLEAGUE_POINTS.winnerBonus,
      marginBase: EUROLEAGUE_POINTS.marginBase,
      bingo: EUROLEAGUE_POINTS.bingo,
      exactMargin: EUROLEAGUE_POINTS.exactMarginBonus,
      serijaStep: SERIJA_STEP,
      rates: ratesOf(rules),
    },
    bounds: { min: PREDICTION_MIN, max: PREDICTION_MAX, drawsAllowed: false },
    marginExamples: marginExamples(),
    oddsExamples: oddsExamples(),
    oddsCountRealOnly: !rules.crowdOddsCountFilledIn,
    serijaExamples: [1, 2, 3].map((run) => ({
      run,
      bonus: serijaBonus(run, 1).hundredths / 100,
    })),
    serijaOrder: 'tip-off',
    switchOffAfterMisses: rules.switchOff.afterFillIns,
    placeExamples: places,
    placesContinue: last !== undefined && last.points > 0,
    placeStep: STANDINGS_POINTS.placeStep,
    teamCount: facts.teamCount,
    bracket: [
      {
        stage: 'playOffs',
        points: STANDINGS_POINTS.playOffs,
        count: STANDINGS_COUNTS.playOffs,
      },
      {
        stage: 'finalFour',
        points: STANDINGS_POINTS.finalFour,
        count: STANDINGS_COUNTS.finalFour,
      },
    ],
    finalsGrid: FINAL_PLACES.map((predicted) =>
      FINAL_PLACES.map((actual) => finalPoints(predicted, actual)),
    ),
    deadlineRound: facts.deadlineRound,
    standingsCloses: facts.standingsCloses,
  };
  return Object.freeze(page);
}
