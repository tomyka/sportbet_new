import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import {
  foldSurvival,
  survivalAtResultEntry,
  type SurvivalPick,
  type SurvivalRow,
} from './survival-fold';

export interface PickContext {
  readonly season: Season;
  readonly now: Instant;
  /** The tournament's teams: R-11's used list resets after all of them. */
  readonly teamCount: number;
}

export type PickRefusal =
  | 'no-current-round'
  | 'round-has-no-survival'
  | 'round-already-scored'
  | 'pick-locked'
  | 'team-already-started'
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

  static of(
    picks: readonly SurvivalPick[],
  ): Result<SurvivalRun, 'two-picks-in-one-round'> {
    const rounds = new Set(picks.map((pick) => pick.round));
    return rounds.size === picks.length
      ? ok(new SurvivalRun(picks))
      : refuse('two-picks-in-one-round');
  }

  /**
   * SU-4, SU-5, SU-7, SU-8: pick `team` for the current round (R-6). sportbet
   * lets a pick change until the round is scored and moves a re-picked team;
   * the ruled set locks a pick at its team's tip-off, refuses a team whose
   * game has started (R-4, sportbet#256) and a team already used in the run
   * until all have been used (R-11).
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
    const others = this.picks.filter((pick) => pick.round !== round);
    if (
      rules.survivalTeamOncePerRun &&
      usedInRun(others, season.games, context.teamCount).has(team)
    ) {
      return refuse('team-used-in-run');
    }
    return ok(new SurvivalRun([...others, { round, team }]));
  }

  /** Every pick's stored value, in round order (see foldSurvival). */
  fold(games: readonly Game[]): SurvivalRow[] {
    return foldSurvival(this.picks, games);
  }

  /** sportbet's values as written at each result entry (SU-10). */
  atResultEntry(games: readonly Game[]): SurvivalRow[] {
    return survivalAtResultEntry(this.picks, games);
  }
}

/**
 * R-11: the teams used in the run the next pick joins. A loss starts a new
 * run with every team free, and so does using all of the tournament's
 * teams. A pending pick counts as used.
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
