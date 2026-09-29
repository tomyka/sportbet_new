import type { RuleSet } from '../rules/rule-set';
import type { GameId, RoundNumber } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { Game } from './game';
import type { Round } from './round';

/** Euroleague standings close at the first game of round 5 (ST-2). */
export const STANDINGS_DEADLINE_ROUND = 5;

export interface SeasonInput {
  readonly rounds: readonly Round[];
  readonly games: readonly Game[];
  /** The tournament's end date (R-21). */
  readonly endsAt: Instant;
  /** The tournament's own standings deadline round, if an admin set one. */
  readonly standingsDeadlineRound?: RoundNumber;
}

interface SeasonState {
  readonly rounds: readonly Round[];
  readonly games: readonly Game[];
  readonly endsAt: Instant;
  readonly standingsDeadlineRound: number;
}

export type SeasonRefusal =
  'duplicate-round' | 'duplicate-game' | 'game-in-unknown-round';

function byTipOffThenId(a: Game, b: Game): number {
  return a.tipOff - b.tipOff || a.id - b.id;
}

function earliest(games: readonly Game[]): Game | undefined {
  return [...games].sort(byTipOffThenId)[0];
}

/** The most recent game by tip-off, ties broken by the higher id. */
function latest(games: readonly Game[]): Game | undefined {
  return [...games].sort(byTipOffThenId).at(-1);
}

/** One tournament's rounds and games. */
export class Season {
  readonly rounds: readonly Round[];
  readonly games: readonly Game[];
  readonly endsAt: Instant;
  readonly standingsDeadlineRound: number;

  private constructor(state: SeasonState) {
    this.rounds = Object.freeze([...state.rounds]);
    this.games = Object.freeze([...state.games]);
    this.endsAt = state.endsAt;
    this.standingsDeadlineRound = state.standingsDeadlineRound;
    Object.freeze(this);
  }

  static create(input: SeasonInput): Result<Season, SeasonRefusal> {
    const numbers = new Set(input.rounds.map((round) => round.number));
    if (numbers.size !== input.rounds.length) {
      return refuse('duplicate-round');
    }
    if (
      new Set(input.games.map((game) => game.id)).size !== input.games.length
    ) {
      return refuse('duplicate-game');
    }
    if (input.games.some((game) => !numbers.has(game.round))) {
      return refuse('game-in-unknown-round');
    }
    return ok(
      new Season({
        ...input,
        standingsDeadlineRound:
          input.standingsDeadlineRound ?? STANDINGS_DEADLINE_ROUND,
      }),
    );
  }

  round(number: RoundNumber): Round | undefined {
    return this.rounds.find((round) => round.number === number);
  }

  game(id: GameId): Game | undefined {
    return this.games.find((game) => game.id === id);
  }

  /** The same season with one of its games replaced by a newer state. */
  withGame(game: Game): Season {
    if (this.game(game.id) === undefined) {
      throw new Error(`Season.withGame: game ${String(game.id)} is not in it`);
    }
    return new Season({
      rounds: this.rounds,
      games: this.games.map((each) => (each.id === game.id ? game : each)),
      endsAt: this.endsAt,
      standingsDeadlineRound: this.standingsDeadlineRound,
    });
  }

  /**
   * LR-3. sportbet: the round of the earliest game without a result, by
   * tip-off. Ruled (R-6): the round whose next game tips off soonest; a game
   * that has tipped off without a result is not a next game. When no
   * unplayed game is still to come, the round of the earliest one waiting
   * for its result; when there is no such game either (every game of the
   * season has a result), R-40 makes the current round the one of the most
   * recent game played.
   */
  currentRound(now: Instant, rules: RuleSet): RoundNumber | null {
    const unplayed = this.games.filter((game) => game.result === null);
    if (unplayed.length === 0) {
      return rules.currentRound === 'soonest-next-game'
        ? (latest(this.games)?.round ?? null)
        : null;
    }
    const next =
      rules.currentRound === 'soonest-next-game'
        ? earliest(unplayed.filter((game) => !game.hasTippedOffAt(now)))
        : undefined;
    return (next ?? earliest(unplayed))?.round ?? null;
  }

  /** R-21: the end date has passed and every game is scored. */
  isFinishedAt(now: Instant): boolean {
    return (
      now >= this.endsAt && this.games.every((game) => game.result !== null)
    );
  }

  /** LR-6: sportbet rescores every tournament; ruled freezes finished ones. */
  mayRecalculateAt(now: Instant, rules: RuleSet): boolean {
    return !(rules.finishedTournamentsFrozen && this.isFinishedAt(now));
  }

  /**
   * ST-2: the first tip-off in the deadline round or any later round, so a
   * rescheduled round 5 cannot keep standings open past round 6.
   */
  standingsDeadline(): Instant | null {
    const game = earliest(
      this.games.filter((each) => each.round >= this.standingsDeadlineRound),
    );
    return game?.tipOff ?? null;
  }

  isStandingsOpenAt(now: Instant): boolean {
    const deadline = this.standingsDeadline();
    return deadline === null || now < deadline;
  }

  /** PL-2: sportbet closes at the first game; ruled at the standings deadline (R-8). */
  registrationClosesAt(rules: RuleSet): Instant | null {
    switch (rules.registrationClosesAt) {
      case 'first-game':
        return earliest(this.games)?.tipOff ?? null;
      case 'standings-deadline':
        return this.standingsDeadline();
    }
  }

  isRegistrationOpenAt(now: Instant, rules: RuleSet): boolean {
    const closes = this.registrationClosesAt(rules);
    return closes === null || now < closes;
  }
}
