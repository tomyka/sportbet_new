import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import { foldSurvival, type SurvivalPick } from './survival-fold';

export interface PickContext {
  readonly season: Season;
  readonly now: Instant;
}

export type PickRefusal =
  | 'no-current-round'
  | 'round-has-no-survival'
  | 'round-already-scored'
  | 'pick-locked'
  | 'team-already-started'
  /** R-41: the round's first game has tipped off. */
  | 'round-started'
  | 'team-used-in-run';

/**
 * One player's survival picks in one tournament: the history, one pick per
 * round, never deleted to record a loss (R-5).
 */
export class SurvivalRun {
  static readonly EMPTY = new SurvivalRun([]);

  readonly picks: readonly SurvivalPick[];

  private constructor(picks: readonly SurvivalPick[]) {
    this.picks = Object.freeze([...picks].sort((a, b) => a.round - b.round));
    Object.freeze(this);
  }

  static stored(
    picks: readonly SurvivalPick[],
  ): Result<SurvivalRun, 'two-picks-in-one-round'> {
    const rounds = new Set(picks.map((pick) => pick.round));
    return rounds.size === picks.length
      ? ok(new SurvivalRun(picks))
      : refuse('two-picks-in-one-round');
  }

  /**
   * SU-4, SU-5, SU-7, SU-8: pick `team` for the current round (R-6). Both
   * sets close the round to new and changed picks at its first tip-off, so
   * a postponed game given a later date never reopens it (R-41, applied by
   * sportbet#256). The ruled set also locks a pick at its team's tip-off and
   * refuses a team whose game has started (R-4), and refuses a team already
   * used in the run until all have been used (R-11); sportbet's set, as of
   * 0da316f, moves a re-picked team.
   */
  withPick(
    team: TeamId,
    context: PickContext,
    rules: RuleSet,
  ): Result<SurvivalRun, PickRefusal> {
    const { season, now } = context;
    const round = season.currentRound(now, rules);
    if (round === null) {
      return refuse('no-current-round');
    }
    if (season.round(round)?.survival !== true) {
      return refuse('round-has-no-survival');
    }
    const gameOf = (picked: TeamId): Game | undefined =>
      season.games.find((game) => game.round === round && game.plays(picked));
    const existing = this.picks.find((pick) => pick.round === round);
    if (existing !== undefined) {
      const game = gameOf(existing.team);
      if (game !== undefined && game.winner() !== null) {
        return refuse('round-already-scored');
      }
      if (
        rules.survivalPickLocksAtTipOff &&
        game?.hasTippedOffAt(now) === true
      ) {
        return refuse('pick-locked');
      }
    }
    if (
      rules.survivalPickLocksAtTipOff &&
      gameOf(team)?.hasTippedOffAt(now) === true
    ) {
      return refuse('team-already-started');
    }
    // R-41, in both sets (sportbet#256: SurvivalPick::roundClosed).
    const startsAt = season.roundStartsAt(round);
    if (startsAt !== null && now >= startsAt) {
      return refuse('round-started');
    }
    const others = this.picks.filter((pick) => pick.round !== round);
    if (
      rules.survivalTeamOncePerRun &&
      usedInRun(others, season.games, season.teams().length).has(team)
    ) {
      return refuse('team-used-in-run');
    }
    return ok(new SurvivalRun([...others, { round, team }]));
  }
}

/**
 * R-11: the teams used in the run the next pick joins. A loss starts a new
 * run with every team free, and so does using all of the season's teams
 * (every team that plays one of its games). A pending pick counts as used.
 */
function usedInRun(
  picks: readonly SurvivalPick[],
  games: readonly Game[],
  teamCount: number,
): ReadonlySet<TeamId> {
  const used = new Set<TeamId>();
  for (const row of foldSurvival(picks, games)) {
    if (row.state === 'lost') {
      used.clear();
      continue;
    }
    used.add(row.team);
    if (used.size >= teamCount) {
      used.clear();
    }
  }
  return used;
}
