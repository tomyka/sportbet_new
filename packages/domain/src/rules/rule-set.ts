import type { Stage } from '../round/stage';

/**
 * Every point where sportbet's rules and the owner's rulings differ, and
 * nothing else. Each field names the catalogue rule and the ruling it
 * encodes (docs/superpowers/specs/2026-09-29-euroleague-rules-catalogue.md,
 * docs/owner-rulings.md). A domain method a difference touches takes the
 * rule set as a parameter; nothing reads a global.
 *
 * `sportbetRules` and `ruledRules` are the only instances. A difference
 * between sportbet and the rulings goes here, nowhere else.
 */
export interface RuleSet {
  readonly name: 'sportbet' | 'ruled';

  // Rounds and results
  /** LR-2, R-13: does moving a game later reopen it after it locked? */
  readonly movedGameReopens: 'always' | 'only-before-tip-off';
  /** LR-3, R-6, R-40: which round is current. */
  readonly currentRound: 'earliest-unplayed-game' | 'soonest-next-game';
  /** LR-4, R-10: the rate each stage must carry; null lets an admin set any. */
  readonly stageRates: Readonly<Record<Stage, number>> | null;
  /** LR-6, R-21, R-22: is a finished tournament frozen? */
  readonly finishedTournamentsFrozen: boolean;
  /** MS-10, R-38: may an admin save a level Euroleague result? */
  readonly levelResultAllowed: boolean;

  // Predictions and odds
  /** MS-1, MS-2, R-15: is a prediction with one score blank stored? */
  readonly halfTypedPredictionStored: boolean;
  /** CO-5: is a game with no stored odds scored at 1.0 (sportbet parity)? */
  readonly missingOddsScoreAtOne: boolean;
  /** CO-6, R-2, R-9: are filled-in predictions crowd votes? */
  readonly crowdOddsCountFilledIn: boolean;
  /** FI-4, R-5: are fill-ins a mistaken early result made removed? */
  readonly fillInsOfMistakenResultRemoved: boolean;

  // Survival
  /** SU-4, R-4, sportbet#256: does a pick lock at its team's tip-off? */
  readonly survivalPickLocksAtTipOff: boolean;
  /** SU-5, R-11: is a team used once per run, the list resetting after all? */
  readonly survivalTeamOncePerRun: boolean;
  /** SU-7, R-10: may only regular-season rounds carry survival? */
  readonly survivalRegularSeasonOnly: boolean;

  // Standings
  /** ST-4, R-35: does an exact table position get the crowd bonus? */
  readonly positionsGetCrowdBonus: boolean;
  /**
   * ST-5, ST-7, R-3, R-36: who the stage-tick crowd bonus counts - the
   * players who saved that team's column, or every player who saved
   * anything on the standings page.
   */
  readonly standingsBonusPopulation: 'saved-that-column' | 'saved-anything';
  /** ST-8, R-14: are places paid only from the final regular-season table? */
  readonly placesScoredOnlyFromFinalTable: boolean;

  // Ranking
  /** RA-1, R-18: does every page rank by match + serija + standings + survival? */
  readonly everyPageRanksByFullTotal: boolean;
  /** RA-3, R-30: how tied players are listed. */
  readonly tieOrder: 'per-page' | 'lithuanian';
  /** RA-4, R-19: is an admin hide a state of its own? */
  readonly adminHideSeparate: boolean;
  /** RA-5, R-17: do standings and survival count from the game they were earned? */
  readonly rankHistoryFromWhenEarned: boolean;

  // Players
  /** PL-1, R-7: when a player is switched off for missed games. */
  readonly switchOff: {
    readonly afterFillIns: number;
    readonly countedPer: 'lifetime' | 'tournament';
    readonly realPredictionResetsCount: boolean;
  };
  /** PL-2, R-8: when registration closes. */
  readonly registrationClosesAt: 'first-game' | 'standings-deadline';
  /** PL-2, R-9: does a late joiner get fill-ins for games already played? */
  readonly lateJoinersFilledIn: boolean;
}

/** What production's stored points were computed with (sportbet at 0da316f). */
export const sportbetRules: RuleSet = Object.freeze({
  name: 'sportbet',
  movedGameReopens: 'always',
  currentRound: 'earliest-unplayed-game',
  stageRates: null,
  finishedTournamentsFrozen: false,
  levelResultAllowed: true,
  halfTypedPredictionStored: true,
  missingOddsScoreAtOne: true,
  crowdOddsCountFilledIn: true,
  fillInsOfMistakenResultRemoved: false,
  survivalPickLocksAtTipOff: false,
  survivalTeamOncePerRun: false,
  survivalRegularSeasonOnly: false,
  positionsGetCrowdBonus: true,
  standingsBonusPopulation: 'saved-that-column',
  placesScoredOnlyFromFinalTable: false,
  everyPageRanksByFullTotal: false,
  tieOrder: 'per-page',
  adminHideSeparate: false,
  rankHistoryFromWhenEarned: false,
  switchOff: Object.freeze({
    afterFillIns: 5,
    countedPer: 'lifetime',
    realPredictionResetsCount: false,
  }),
  registrationClosesAt: 'first-game',
  lateJoinersFilledIn: false,
} as const);

/** sportbet plus the owner's rulings: what sportbet_new goes live with. */
export const ruledRules: RuleSet = Object.freeze({
  name: 'ruled',
  movedGameReopens: 'only-before-tip-off',
  currentRound: 'soonest-next-game',
  stageRates: Object.freeze({
    regular: 1,
    'play-in': 1,
    'play-offs': 2,
    'final-four': 3,
    final: 3,
  }),
  finishedTournamentsFrozen: true,
  levelResultAllowed: false,
  halfTypedPredictionStored: false,
  missingOddsScoreAtOne: false,
  crowdOddsCountFilledIn: false,
  fillInsOfMistakenResultRemoved: true,
  survivalPickLocksAtTipOff: true,
  survivalTeamOncePerRun: true,
  survivalRegularSeasonOnly: true,
  positionsGetCrowdBonus: false,
  standingsBonusPopulation: 'saved-anything',
  placesScoredOnlyFromFinalTable: true,
  everyPageRanksByFullTotal: true,
  tieOrder: 'lithuanian',
  adminHideSeparate: true,
  rankHistoryFromWhenEarned: true,
  switchOff: Object.freeze({
    afterFillIns: 20,
    countedPer: 'tournament',
    realPredictionResetsCount: true,
  }),
  registrationClosesAt: 'standings-deadline',
  lateJoinersFilledIn: true,
} as const);
