import type { RuleSet } from '@sportbet/domain';

/** A RuleSet field: one difference between sportbet and the rulings. */
export type RuleField = Exclude<keyof RuleSet, 'name'>;

/**
 * A ruling: its catalogue rules and owner rulings ("CO-5, CO-7"), what it
 * says, whether recalculateTournament reads it, and the field it acts only
 * alongside, or null: a scoring field with no prerequisite of its own.
 */
export interface Ruling {
  readonly rules: string;
  readonly ruling: string;
  readonly scoring: boolean;
  readonly needs: RuleField | null;
}

/**
 * Every RuleSet field, named after its catalogue rule and ruling, and
 * whether recalculateTournament reads it (directly, or through the crowd
 * odds, the standings or the survival refold). A field it does not read
 * governs entry or ranking only and changes no stored row. A field read
 * only when another is on needs that one. Checked against
 * every field (`satisfies`), so neither a new field left out nor a stale
 * one left in compiles.
 */
export const RULINGS: Readonly<Record<RuleField, Ruling>> = Object.freeze({
  movedGameReopens: {
    rules: 'LR-2, R-13',
    ruling: 'a moved game reopens only before its tip-off',
    scoring: false,
    needs: null,
  },
  currentRound: {
    rules: 'LR-3, R-6, R-40',
    ruling: 'the current round is the soonest next game',
    scoring: false,
    needs: null,
  },
  stageRates: {
    rules: 'LR-4, R-10',
    ruling: 'each stage carries its rate',
    scoring: false,
    needs: null,
  },
  finishedTournamentsFrozen: {
    rules: 'LR-6, R-21, R-22',
    ruling: 'a finished tournament is frozen',
    scoring: false,
    needs: null,
  },
  missingOddsScoreAtOne: {
    rules: 'CO-5, CO-7',
    ruling: 'odds from the votes, never a missing row at 1.0',
    scoring: true,
    needs: null,
  },
  crowdOddsCountFilledIn: {
    rules: 'CO-6, R-2, R-9',
    ruling: 'filled-in predictions are not crowd votes',
    scoring: true,
    // The votes count only where the odds come from them.
    needs: 'missingOddsScoreAtOne',
  },
  fillInsOfMistakenResultRemoved: {
    rules: 'FI-4, R-5',
    ruling: "a mistaken result's fill-ins are removed",
    scoring: false,
    needs: null,
  },
  survivalRegularSeasonOnly: {
    rules: 'SU-7, R-10',
    ruling: 'survival in regular-season rounds only',
    scoring: false,
    needs: null,
  },
  survivalScoredFromStoredRows: {
    rules: 'SU-10, R-5',
    ruling: 'survival folded from the pick history',
    scoring: true,
    needs: null,
  },
  positionsGetCrowdBonus: {
    rules: 'ST-4, R-35',
    ruling: 'no crowd bonus on a table position',
    scoring: true,
    needs: null,
  },
  standingsBonusPopulation: {
    rules: 'ST-5, ST-7, R-3, R-36',
    ruling: 'the crowd bonus counts every standings player',
    scoring: true,
    needs: null,
  },
  placesScoredOnlyFromFinalTable: {
    rules: 'ST-8, R-14',
    ruling: 'places paid only from the final table',
    scoring: true,
    needs: null,
  },
  unscoredPlaceStoresNull: {
    rules: 'ST-6, ST-8, R-14',
    ruling: 'an unscored place stores null, not 0',
    scoring: true,
    needs: null,
  },
  everyPageRanksByFullTotal: {
    rules: 'RA-1, R-18',
    ruling: 'every page ranks by the full total',
    scoring: false,
    needs: null,
  },
  tieOrder: {
    rules: 'RA-3, R-30',
    ruling: 'ties listed in Lithuanian order',
    scoring: false,
    needs: null,
  },
  adminHideSeparate: {
    rules: 'RA-4, R-19',
    ruling: 'an admin hide is a state of its own',
    scoring: false,
    needs: null,
  },
  rankHistoryFromWhenEarned: {
    rules: 'RA-5, R-17',
    ruling: 'standings and survival count from when earned',
    scoring: false,
    needs: null,
  },
  leaderboardCountsEachListedTournament: {
    rules: 'RA-4, R-77',
    ruling: 'the leaderboard counts each tournament where a player is listed',
    scoring: false,
    needs: null,
  },
  leaderboardPublicTournamentsOnly: {
    rules: 'RA-4, R-50, R-77',
    ruling: 'only public tournaments feed the leaderboard',
    scoring: false,
    needs: null,
  },
  switchOff: {
    rules: 'PL-1, R-7, R-32',
    ruling: 'switched off after 20 fill-ins in a tournament',
    scoring: false,
    needs: null,
  },
  onlyAScoreSwitchesBackOn: {
    rules: 'PL-1, R-7, R-57',
    ruling: 'only a saved score switches a player back on',
    scoring: false,
    needs: null,
  },
  lateJoinersFilledIn: {
    rules: 'PL-2, R-9',
    ruling: 'a late joiner is filled in for games already played',
    scoring: false,
    needs: null,
  },
  hubFinishedFollowsR21: {
    rules: 'LR-6, R-21, R-55',
    ruling: "the hub's finished group follows R-21",
    scoring: false,
    needs: null,
  },
  nonPublicTournamentsHidden: {
    rules: 'R-50',
    ruling:
      'a non-public tournament is shown only to its players and admins, and sign-up never joins it',
    scoring: false,
    needs: null,
  },
  lastLeagueCountedPer: {
    rules: 'R-29',
    ruling:
      'the only league a player cannot leave is counted in their tournament, not across every tournament',
    scoring: false,
    needs: null,
  },
  memberSearch: {
    rules: 'R-88',
    ruling:
      "a league admin finds only the players of the league's tournament when adding members",
    scoring: false,
    needs: null,
  },
  collectedPotLeavesGuestsOut: {
    rules: 'R-88',
    ruling: "a league's collected pot sums full members only, not its guests",
    scoring: false,
    needs: null,
  },
  feeDueHiddenFromGuests: {
    rules: 'R-104, R-124',
    ruling:
      'a league guest sees nothing about money: no fee due, no paid line, no pots, no payment pop-up',
    scoring: false,
    needs: null,
  },
} satisfies Record<RuleField, Ruling>);
