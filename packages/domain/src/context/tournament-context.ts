import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { RoundNumber } from '../shared/ids';
import type { Instant } from '../shared/instant';

/** Which conditional entries the navigation shows (sportbet's navShow* session keys). */
export interface NavVisibility {
  /** The survival pick page: the current round and the tournament both play survival. */
  readonly survival: boolean;
  /** The summary pages: the tournament has started, or some result is in. */
  readonly summary: boolean;
  /** The survival summary: the tournament plays survival at all. */
  readonly survivalSummary: boolean;
}

/** The request's tournament as the shell and the pages read it, per request (decision 5). */
export interface TournamentContext {
  /** LR-3, under the rule set given; null when no round is current. */
  readonly currentRound: RoundNumber | null;
  /** The first game has tipped off (sportbet's `disabled`). */
  readonly started: boolean;
  /** Standings no longer take edits (CONTEXT.md > Standings deadline). */
  readonly standingsLocked: boolean;
  readonly nav: NavVisibility;
}

/** setLeaguelessSession: a player in no tournament sees no conditional entry. */
export const NO_TOURNAMENT_NAV: NavVisibility = Object.freeze({
  survival: false,
  summary: false,
  survivalSummary: false,
});

/**
 * SessionController::setSession's rules, for one tournament at `now`.
 * `started` is NavVisibility::hasKickedOff - the earliest game of all
 * strictly before `now`, so exactly at kick-off it has not; the summary
 * shows once started or once any game has a result (#129's
 * anyScoredGame); the survival entry needs the current round's survival
 * flag and the tournament's; standings lock at Season.standingsDeadline,
 * and a tournament with no game in its deadline round never locks.
 */
export function tournamentContext(input: {
  readonly season: Season;
  /** The tournament plays survival (sportbet's `survival_game`). */
  readonly survival: boolean;
  readonly now: Instant;
  readonly rules: RuleSet;
}): TournamentContext {
  const { season, survival, now, rules } = input;
  const currentRound = season.currentRound(now, rules);
  const firstTipOff = season.firstTipOff();
  const started = firstTipOff !== null && firstTipOff < now;
  const roundPlaysSurvival =
    currentRound !== null && (season.round(currentRound)?.survival ?? false);
  return {
    currentRound,
    started,
    standingsLocked: !season.isStandingsOpenAt(now),
    nav: {
      survival: roundPlaysSurvival && survival,
      summary: started || season.hasAnyResult(),
      survivalSummary: survival,
    },
  };
}

/**
 * The tournament a request is about, by id (R-28, then
 * SessionController::activeMembership): the one the player used last, if
 * they are still in it; else the only one they are in; else none.
 *
 * With several and none last used, the newest - the highest id - is the
 * owner's ruling (#16, Q1, 2026-10-05), not a sportbet rule: sportbet
 * takes whichever active membership MySQL returns first (no ORDER BY), an
 * unordered pick with no rule behind it. So it is not a RuleSet
 * difference either: both rule sets choose the same way.
 */
export function chooseTournament(input: {
  readonly lastUsed: number | null;
  readonly playing: readonly number[];
}): number | null {
  const { lastUsed, playing } = input;
  if (lastUsed !== null && playing.includes(lastUsed)) return lastUsed;
  if (playing.length <= 1) return playing[0] ?? null;
  return Math.max(...playing);
}
