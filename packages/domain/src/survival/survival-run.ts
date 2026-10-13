import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import { foldSurvival, type SurvivalPick } from './survival-fold';

export interface PickContext {
  readonly season: Season;
  /** The tournament's teams (R-81: "every team used" counts these). */
  readonly teams: readonly TeamId[];
  /** The tournament plays survival (sportbet's `survival_game`). */
  readonly survivalPlayed: boolean;
  readonly now: Instant;
  /** The round the posting page showed, when it says. */
  readonly shownRound?: RoundNumber;
}

export type PickRefusal =
  | 'unknown-team'
  | 'no-current-round'
  | 'round-changed'
  | 'round-has-no-survival'
  | 'round-already-scored'
  | 'team-not-playing'
  | 'team-already-started'
  | 'pick-locked'
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
   * SU-4, SU-5, SU-7, SU-8: pick `team` for the current round (R-6), asking
   * SurvivalPick::decide's questions in its order and answering the first
   * that fails: the team is the tournament's; there is a current round; it
   * is the round the page showed; it plays survival; it is not scored for
   * the player; the team plays in it (R-81); every game of the team is open
   * (LR-1, R-41, R-81); the round's pick has not tipped off (R-4, the
   * clock); the team is not used in the run (R-11, R-81). Both sets ask
   * all nine (sportbet#256, #292, #297).
   */
  withPick(
    team: TeamId,
    context: PickContext,
    rules: RuleSet,
  ): Result<SurvivalRun, PickRefusal> {
    if (!context.teams.includes(team)) {
      return refuse('unknown-team');
    }
    const round = context.season.currentRound(context.now, rules);
    if (round === null) {
      return refuse('no-current-round');
    }
    const refusal =
      roundRefusal(round, context, rules) ??
      this.pickRefusal(team, round, context);
    return refusal === null
      ? ok(new SurvivalRun([...this.othersThan(round), { round, team }]))
      : refuse(refusal);
  }

  private pickRefusal(
    team: TeamId,
    round: RoundNumber,
    context: PickContext,
  ): PickRefusal | null {
    const games = (picked: TeamId): readonly Game[] =>
      gamesOf(context.season, round, picked);
    const existing = this.picks.find((pick) => pick.round === round);
    const held = existing === undefined ? [] : games(existing.team);
    if (held.some((game) => game.winner() !== null)) {
      return 'round-already-scored';
    }
    const teamGames = games(team);
    if (teamGames.length === 0) return 'team-not-playing';
    if (!teamGames.every((game) => game.isOpenAt(context.now))) {
      return 'team-already-started';
    }
    if (held.some((game) => game.hasTippedOffAt(context.now))) {
      return 'pick-locked';
    }
    return usedTeams(this, context, round).has(team)
      ? 'team-used-in-run'
      : null;
  }

  private othersThan(round: RoundNumber): readonly SurvivalPick[] {
    return this.picks.filter((pick) => pick.round !== round);
  }
}

/** Questions 3 and 4: the round the page showed, and its survival flag. */
function roundRefusal(
  round: RoundNumber,
  context: PickContext,
  rules: RuleSet,
): PickRefusal | null {
  if (context.shownRound !== undefined && context.shownRound !== round) {
    return 'round-changed';
  }
  return playsSurvival(round, context, rules) ? null : 'round-has-no-survival';
}

/**
 * SU-7, R-10: the round takes survival picks - flagged for survival, in a
 * tournament that plays it, and under `survivalRegularSeasonOnly` a
 * regular-season round (sportbet's `eventSurvival`).
 */
export function playsSurvival(
  round: RoundNumber,
  context: Pick<PickContext, 'season' | 'survivalPlayed'>,
  rules: RuleSet,
): boolean {
  const played = context.season.round(round);
  return (
    played?.survival === true &&
    context.survivalPlayed &&
    (!rules.survivalRegularSeasonOnly || played.stage === 'regular')
  );
}

/** The team's games in the round. */
export function gamesOf(
  season: Season,
  round: RoundNumber,
  team: TeamId,
): readonly Game[] {
  return season.games.filter(
    (game) => game.round === round && game.plays(team),
  );
}

/**
 * R-11, R-81: the teams used in the run the round's pick joins, the round
 * itself left out (switching within it is not a re-use). A loss starts a
 * new run with every team free, and so does using as many teams as the
 * tournament has (its team list, a team without a game included). A
 * pending pick counts as used.
 */
export function usedTeams(
  run: SurvivalRun,
  context: Pick<PickContext, 'season' | 'teams'>,
  round: RoundNumber,
): ReadonlySet<TeamId> {
  const used = new Set<TeamId>();
  const others = run.picks.filter((pick) => pick.round !== round);
  for (const row of foldSurvival(others, context.season.games)) {
    if (row.state === 'lost') {
      used.clear();
      continue;
    }
    used.add(row.team);
    if (used.size >= context.teams.length) {
      used.clear();
    }
  }
  return used;
}
