import { EUROLEAGUE_POINTS } from '../prediction/match-scoring';
import {
  publishedMatchFigures,
  type MarginExample,
  type OddsExample,
} from '../prediction/published-figures';
import { statedRates } from '../round/stage';
import {
  publishedSerijaExamples,
  SERIJA_STEP,
  type SerijaExample,
} from '../serija/serija';
import {
  publishedStandingsFigures,
  type BracketRow,
  type PlaceExample,
} from '../standings/standings-scoring';
import type { RuleSet } from './rule-set';
import { NO_TOURNAMENT_FACTS, type TournamentFacts } from './tournament-facts';

/** Every figure and rule-dependent line of /rules (slice 18, #35, R-100). */
export interface RulesPage {
  readonly tiles: {
    readonly winnerBonus: number;
    readonly marginBase: number;
    /** R-138: what each point of miss costs, "50 - slope x |error|". */
    readonly differenceSlope: number;
    readonly bingo: number;
    readonly exactMargin: number;
    /** What each later call of a run adds: the tile reads "+(N-1)xstep" (R-106). */
    readonly serijaStep: number;
    /** The stage rates, distinct, in stage order (R-10): "x1 / x2" under sportbet's set. */
    readonly rates: readonly number[];
  };
  readonly marginExamples: readonly MarginExample[];
  readonly oddsExamples: readonly OddsExample[];
  /** R-2: only real predictions count toward the crowd odds. */
  readonly oddsCountRealOnly: boolean;
  readonly serijaExamples: readonly SerijaExample[];
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
  /** The round whose last result closes the standings (R-106, R-128); null with no tournament. */
  readonly deadlineRound: number | null;
}

/**
 * Every figure and rule-dependent line of /rules, from the areas' published
 * figures (`publishedMatchFigures`, `publishedSerijaExamples`,
 * `publishedStandingsFigures`: the same scorers that recalculateTournament
 * uses) and their constants, so the page cannot drift from scoring (R-100).
 * `facts` is the tournament described, null where there is none.
 */
export function rulesPage(
  rules: RuleSet,
  facts: TournamentFacts | null,
): RulesPage {
  const { teamCount, deadlineRound } = facts ?? NO_TOURNAMENT_FACTS;
  const match = publishedMatchFigures(rules);
  const standings = publishedStandingsFigures();
  return Object.freeze({
    tiles: {
      winnerBonus: EUROLEAGUE_POINTS.winnerBonus,
      marginBase: EUROLEAGUE_POINTS.marginBase,
      differenceSlope: rules.differenceSlope,
      bingo: rules.exactScoreBonus,
      exactMargin: rules.exactDifferenceBonus,
      serijaStep: SERIJA_STEP,
      rates: statedRates(rules.stageRates),
    },
    marginExamples: match.marginExamples,
    oddsExamples: match.oddsExamples,
    oddsCountRealOnly: !rules.crowdOddsCountFilledIn,
    serijaExamples: publishedSerijaExamples(),
    switchOffAfterMisses: rules.switchOff.afterFillIns,
    ...standings,
    teamCount,
    deadlineRound,
  });
}
