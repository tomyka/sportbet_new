import { STAGE_RATES, type Stage } from '../round/stage';

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

  // Predictions
  /** FI-4, R-5: are fill-ins a mistaken early result made removed? */
  readonly fillInsOfMistakenResultRemoved: boolean;

  // Ranking
  /** RA-4, R-19: is an admin hide a state of its own? */
  readonly adminHideSeparate: boolean;
  /**
   * RA-4, R-77: does /leaderboard count a player's points from each
   * tournament where they are listed? sportbet has one account-wide switch:
   * a player switched off anywhere is off the leaderboard altogether.
   */
  readonly leaderboardCountsEachListedTournament: boolean;
  /**
   * RA-4, R-50, R-77 amended: do only public tournaments feed /leaderboard?
   * A non-public tournament is shown only to its players (R-50), so its
   * points stay off the public page. sportbet counts every tournament.
   */
  readonly leaderboardPublicTournamentsOnly: boolean;

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
  /**
   * PL-1, R-7, R-57: does only a saved score switch a player back on?
   * sportbet's save switches them on for any accepted save - a cleared
   * prediction included (PredictionResultController::updatePredictionResultUser
   * reactivates before it looks at the scores).
   */
  readonly onlyAScoreSwitchesBackOn: boolean;
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
   * R-50: is a non-public tournament shown only to its players and admins,
   * and (R-50 amended) kept out of sign-up - never joined by R-27 or a
   * `?tournament=` link, and never opening sign-up by itself (R-49)?
   * sportbet's hub lists every tournament, its sign-up joins any, and it
   * never reads `is_public`.
   */
  readonly nonPublicTournamentsHidden: boolean;

  // Leagues
  /**
   * R-29: which leagues make "you cannot leave your only league" true?
   * sportbet counts the player's other leagues anywhere
   * (LeagueController::leaveLeague), so a league in another tournament lets
   * them leave a tournament's last one; ruled counts this tournament's only,
   * so a player always keeps their public league in each tournament.
   */
  readonly lastLeagueCountedPer: 'account' | 'tournament';
  /**
   * R-88: whom may a league admin find when adding members? sportbet
   * searches every account (LeagueController::searchUsers); ruled only the
   * players of the league's tournament (less personal data shown).
   */
  readonly memberSearch: 'every-account' | 'tournament-players';
  /**
   * R-88: does a league's collected pot leave its guests out? sportbet's
   * `League::collectedPot` sums every member's recorded amount, a guest's
   * included; ruled sums full members only, as the expected pot already does.
   */
  readonly collectedPotLeavesGuestsOut: boolean;
  /**
   * R-104, R-124: is a league guest shown nothing about money (the fee due,
   * the paid line, the counts and pots, the payment pop-up)? sportbet shows
   * a guest what it shows a full member.
   */
  readonly feeDueHiddenFromGuests: boolean;
}

/**
 * What production's stored points were computed with (sportbet at 1618164).
 * sportbet applies R-41 itself (sportbet#256, its round close reversed by
 * sportbet#297), R-15 (sportbet#287) and R-38 (sportbet#274), so none of
 * them is a difference. It also locks a survival pick at its team's tip-off
 * and refuses a team already used in the run (sportbet#256, #292), so R-4
 * and R-11 are not differences either (R-81; catalogue SU-4, SU-5).
 */
export const sportbetRules: RuleSet = Object.freeze({
  name: 'sportbet',
  movedGameReopens: 'always',
  currentRound: 'earliest-unplayed-game',
  stageRates: null,
  finishedTournamentsFrozen: false,
  fillInsOfMistakenResultRemoved: false,
  adminHideSeparate: false,
  leaderboardCountsEachListedTournament: false,
  leaderboardPublicTournamentsOnly: false,
  switchOff: Object.freeze({
    afterFillIns: 5,
    countedPer: 'lifetime',
    realPredictionResetsCount: false,
  }),
  onlyAScoreSwitchesBackOn: false,
  lateJoinersFilledIn: false,
  hubFinishedFollowsR21: false,
  nonPublicTournamentsHidden: false,
  lastLeagueCountedPer: 'account',
  memberSearch: 'every-account',
  collectedPotLeavesGuestsOut: false,
  feeDueHiddenFromGuests: false,
} as const);

/** sportbet plus the owner's rulings: what sportbet_new goes live with. */
export const ruledRules: RuleSet = Object.freeze({
  name: 'ruled',
  movedGameReopens: 'only-before-tip-off',
  currentRound: 'soonest-next-game',
  stageRates: STAGE_RATES,
  finishedTournamentsFrozen: true,
  fillInsOfMistakenResultRemoved: true,
  adminHideSeparate: true,
  leaderboardCountsEachListedTournament: true,
  leaderboardPublicTournamentsOnly: true,
  switchOff: Object.freeze({
    afterFillIns: 20,
    countedPer: 'tournament',
    realPredictionResetsCount: true,
  }),
  onlyAScoreSwitchesBackOn: true,
  lateJoinersFilledIn: true,
  hubFinishedFollowsR21: true,
  nonPublicTournamentsHidden: true,
  lastLeagueCountedPer: 'tournament',
  memberSearch: 'tournament-players',
  collectedPotLeavesGuestsOut: true,
  feeDueHiddenFromGuests: true,
} as const);
