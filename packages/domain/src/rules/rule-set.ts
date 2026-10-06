import type { Stage } from '../round/stage';

/**
 * The two rule sets' names. The database's `points_source` enum is built
 * from this list (plus `production`, the rows as production stored them).
 */
export const RULE_SET_NAMES = ['sportbet', 'ruled'] as const;

export type RuleSetName = (typeof RULE_SET_NAMES)[number];

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
  readonly name: RuleSetName;

  // Rounds and results
  /** LR-2, R-13: does moving a game later reopen it after it locked? */
  readonly movedGameReopens: 'always' | 'only-before-tip-off';
  /** LR-3, R-6, R-40: which round is current. */
  readonly currentRound: 'earliest-unplayed-game' | 'soonest-next-game';
  /** LR-4, R-10: the rate each stage must carry; null lets an admin set any. */
  readonly stageRates: Readonly<Record<Stage, number>> | null;
  /** LR-6, R-21, R-22: is a finished tournament frozen? */
  readonly finishedTournamentsFrozen: boolean;

  // Predictions and odds
  /**
   * CO-5: a guard, not a scoring difference - it does not change any
   * computed number. It decides whether `CrowdOdds.missing()` may be
   * constructed at all: sportbet scores a game with no stored odds row at
   * 1.0, so it is allowed there; the ruled set always has odds from the
   * votes (a game with no votes still gets CO-4's zero odds), so a missing
   * row is an impossible state and asking for it is a programmer error.
   * inputReadsOf reads it too: a set that scores a missing
   * row reads the odds production stored, the ruled set computes them.
   */
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
  /**
   * SU-10, R-5: is survival scored by refolding the stored rows (sportbet's
   * full recalculation) rather than by folding the pick history against the
   * results? recalculateTournament reads it; a caller passes whichever it
   * holds, and inputReadsOf names what the database loads.
   */
  readonly survivalScoredFromStoredRows: boolean;

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
  /**
   * ST-6, ST-8, R-14: does a table position with no table to score it from
   * yet (under R-14, before the final table is entered) store null, not
   * scored yet, as a stage nobody has reached does? sportbet stores 0.
   */
  readonly unscoredPlaceStoresNull: boolean;

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
  /**
   * PL-1, R-7, R-32: when a player is switched off for missed games.
   * `countedPer` scopes both the count and the switch it drives: sportbet
   * has one lifetime count and one switch; under R-7 each tournament has
   * its own, so a player is switched off (unlisted, no fill-ins) only in
   * the tournament they missed 20 games of, and a real save switches them
   * back on there only.
   */
  readonly switchOff: {
    readonly afterFillIns: number;
    readonly countedPer: 'lifetime' | 'tournament';
    readonly realPredictionResetsCount: boolean;
  };
  /** PL-2, R-8: when registration closes. */
  readonly registrationClosesAt: 'first-game' | 'standings-deadline';
  /** PL-2, R-9: does a late joiner get fill-ins for games already played? */
  readonly lateJoinersFilledIn: boolean;

  // Tournaments hub
  /**
   * LR-6, R-21, R-55: does the hub group a tournament as finished only as
   * R-21 finishes it? sportbet's hub also does when an admin marks it
   * finished or every game entered so far is scored
   * (Tournament::effectiveStatus).
   */
  readonly hubFinishedFollowsR21: boolean;
  /**
   * R-50: is a non-public tournament shown only to its players and admins?
   * sportbet's hub lists every tournament and never reads `is_public`.
   */
  readonly nonPublicTournamentsHidden: boolean;
}

/**
 * What production's stored points were computed with (sportbet at 3eb95e7).
 * sportbet applies R-41 itself (sportbet#256, its round close reversed by
 * sportbet#297), R-15 (sportbet#287) and R-38 (sportbet#274), so none of
 * them is a difference; `survivalPickLocksAtTipOff` and
 * `survivalTeamOncePerRun` still describe 0da316f's write path, pending #13
 * (catalogue SU-4, SU-5).
 */
export const sportbetRules: RuleSet = Object.freeze({
  name: 'sportbet',
  movedGameReopens: 'always',
  currentRound: 'earliest-unplayed-game',
  stageRates: null,
  finishedTournamentsFrozen: false,
  missingOddsScoreAtOne: true,
  crowdOddsCountFilledIn: true,
  fillInsOfMistakenResultRemoved: false,
  survivalPickLocksAtTipOff: false,
  survivalTeamOncePerRun: false,
  survivalRegularSeasonOnly: false,
  survivalScoredFromStoredRows: true,
  positionsGetCrowdBonus: true,
  standingsBonusPopulation: 'saved-that-column',
  placesScoredOnlyFromFinalTable: false,
  unscoredPlaceStoresNull: false,
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
  hubFinishedFollowsR21: false,
  nonPublicTournamentsHidden: false,
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
  missingOddsScoreAtOne: false,
  crowdOddsCountFilledIn: false,
  fillInsOfMistakenResultRemoved: true,
  survivalPickLocksAtTipOff: true,
  survivalTeamOncePerRun: true,
  survivalRegularSeasonOnly: true,
  survivalScoredFromStoredRows: false,
  positionsGetCrowdBonus: false,
  standingsBonusPopulation: 'saved-anything',
  placesScoredOnlyFromFinalTable: true,
  unscoredPlaceStoresNull: true,
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
  hubFinishedFollowsR21: true,
  nonPublicTournamentsHidden: true,
} as const);
