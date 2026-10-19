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
    const round = context.season.currentRound(context.now, rules);
    if (round === null) return refuse(noRoundRefusals(team, context)[0]);
    const [refusal] = refusalsOf(
      team,
      this.readRound(round, context, rules),
      context,
    );
    return refusal === undefined
      ? ok(new SurvivalRun([...this.othersThan(round), { round, team }]))
      : refuse(refusal);
  }

  /**
   * Every question withPick asks that fails for each of `teams`, in its
   * order (the first is withPick's answer); none means withPick accepts the
   * team. The run's used-team fold is read once for all of them: this is
   * what the pick page offers, card by card.
   */
  refusalsFor(
    teams: readonly TeamId[],
    context: PickContext,
    rules: RuleSet,
  ): ReadonlyMap<TeamId, readonly PickRefusal[]> {
    const round = context.season.currentRound(context.now, rules);
    if (round === null) {
      return new Map(
        teams.map((team) => [team, noRoundRefusals(team, context)]),
      );
    }
    const reading = this.readRound(round, context, rules);
    return new Map(
      teams.map((team) => [team, refusalsOf(team, reading, context)]),
    );
  }

  private readRound(
    round: RoundNumber,
    context: PickContext,
    rules: RuleSet,
  ): RoundReading {
    const existing = this.picks.find((pick) => pick.round === round);
    const held =
      existing === undefined
        ? []
        : gamesOf(context.season, round, existing.team);
    return {
      round,
      roundRefusals: roundRefusals(round, context, rules),
      scored: held.some((game) => game.winner() !== null),
      heldTippedOff: anyTippedOff(held, context.now),
      used: usedTeams(this, context, round, rules),
    };
  }

  private othersThan(round: RoundNumber): readonly SurvivalPick[] {
    return this.picks.filter((pick) => pick.round !== round);
  }
}

/** What one reading of the run says about the current round, whatever the team. */
interface RoundReading {
  readonly round: RoundNumber;
  /** Questions 3 and 4: the round the page showed, and its survival flag. */
  readonly roundRefusals: readonly PickRefusal[];
  /** The round's held pick already has a result. */
  readonly scored: boolean;
  /** The round's held pick has tipped off (R-4). */
  readonly heldTippedOff: boolean;
  readonly used: ReadonlySet<TeamId>;
}

/** Questions 1 and 2, with no current round: nothing after them can be asked. */
function noRoundRefusals(
  team: TeamId,
  context: PickContext,
): readonly [PickRefusal, ...PickRefusal[]] {
  return context.teams.includes(team)
    ? ['no-current-round']
    : ['unknown-team', 'no-current-round'];
}

/** The failing questions for one team, in SurvivalPick::decide's order. */
function refusalsOf(
  team: TeamId,
  reading: RoundReading,
  context: PickContext,
): readonly PickRefusal[] {
  const refusals: PickRefusal[] = [];
  if (!context.teams.includes(team)) refusals.push('unknown-team');
  refusals.push(...reading.roundRefusals);
  if (reading.scored) refusals.push('round-already-scored');
  refusals.push(...teamRefusals(team, reading.round, context));
  if (reading.heldTippedOff) refusals.push('pick-locked');
  if (reading.used.has(team)) refusals.push('team-used-in-run');
  return refusals;
}

/** Questions 6 and 7: the team plays in the round, and every game of it is open. */
function teamRefusals(
  team: TeamId,
  round: RoundNumber,
  context: PickContext,
): readonly PickRefusal[] {
  const games = gamesOf(context.season, round, team);
  if (games.length === 0) return ['team-not-playing'];
  return games.every((game) => game.isOpenAt(context.now))
    ? []
    : ['team-already-started'];
}

/** Questions 3 and 4: the round the page showed, and its survival flag. */
function roundRefusals(
  round: RoundNumber,
  context: PickContext,
  rules: RuleSet,
): readonly PickRefusal[] {
  const refusals: PickRefusal[] = [];
  if (context.shownRound !== undefined && context.shownRound !== round) {
    refusals.push('round-changed');
  }
  if (!playsSurvival(round, context, rules)) {
    refusals.push('round-has-no-survival');
  }
  return refusals;
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

/** R-4: some game of the team in the round has tipped off. */
export function hasTippedOff(
  season: Season,
  round: RoundNumber,
  team: TeamId,
  now: Instant,
): boolean {
  return anyTippedOff(gamesOf(season, round, team), now);
}

function anyTippedOff(games: readonly Game[], now: Instant): boolean {
  return games.some((game) => game.hasTippedOffAt(now));
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
  rules: RuleSet,
): ReadonlySet<TeamId> {
  const used = new Set<TeamId>();
  const others = run.picks.filter((pick) => pick.round !== round);
  for (const row of foldSurvival(others, context.season.games, rules)) {
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
