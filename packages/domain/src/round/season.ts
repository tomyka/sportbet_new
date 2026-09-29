import type { RuleSet } from '../rules/rule-set';
import type { GameId, RoundNumber, TeamId } from '../shared/ids';
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

export type SeasonGameRefusal = 'unknown-game' | 'game-in-unknown-round';

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

  /** Every team that plays a game of the season, each once. */
  teams(): readonly TeamId[] {
    return Object.freeze([
      ...new Set(this.games.flatMap((game) => [game.home, game.away])),
    ]);
  }

  /**
   * The same season with one of its games replaced by a newer state. A game
   * it does not have, or one now in a round it does not have, is refused:
   * the newer state comes from outside (a stored row, an admin's edit).
   */
  withGame(game: Game): Result<Season, SeasonGameRefusal> {
    if (this.game(game.id) === undefined) {
      return refuse('unknown-game');
    }
    if (this.round(game.round) === undefined) {
      return refuse('game-in-unknown-round');
    }
    return ok(
      new Season({
        rounds: this.rounds,
        games: this.games.map((each) => (each.id === game.id ? game : each)),
        endsAt: this.endsAt,
        standingsDeadlineRound: this.standingsDeadlineRound,
      }),
    );
  }

  /**
   * LR-3. sportbet: the round of the earliest game without a result, by
   * tip-off. Ruled (R-6, R-40): the round whose next game - one still open
   * for predictions (no result, not locked, tip-off still in the future) -
   * tips off soonest; when no game is open (every game is scored, waiting
   * for its result past tip-off, postponed with no new date, or locked
   * after a move under R-13), the round of the game that tipped off most
   * recently by `now`, by tip-off then id, so none of those ever pulls the
   * site back to an old round, nor a game still to come (a postponed one's
   * old date) forward.
   *
   * When no game is open and none has tipped off yet (every game locked or
   * postponed before the season starts), the current round is the round of
   * the latest scheduled game that is not postponed, then of the latest
   * game at all. No ruling states this case - R-6 names the soonest open
   * game and R-40 the last one played - so it is an interpretation, flagged
   * for the owner (catalogue LR-3).
   */
  currentRound(now: Instant, rules: RuleSet): RoundNumber | null {
    if (rules.currentRound !== 'soonest-next-game') {
      const unplayed = this.games.filter((game) => game.result === null);
      return earliest(unplayed)?.round ?? null;
    }
    const open = this.games.filter((game) => game.isOpenAt(now));
    const fallback =
      latest(this.games.filter((game) => game.hasTippedOffAt(now))) ??
      latest(this.games.filter((game) => !game.postponed)) ??
      latest(this.games);
    return (earliest(open) ?? fallback)?.round ?? null;
  }

  /**
   * R-41: when the round's first game tipped off, or will: the earliest
   * tip-off among its games, where a game moved after it locked counts at
   * the tip-off it locked at (R-13) and a postponed game only if it had
   * locked. Null when no game of the round has a date.
   */
  roundStartsAt(round: RoundNumber): Instant | null {
    const starts = this.games.flatMap((game) => {
      if (game.round !== round) return [];
      if (game.lockedSince !== null) return [game.lockedSince];
      return game.postponed ? [] : [game.tipOff];
    });
    return starts.reduce<Instant | null>(
      (first, start) => (first === null || start < first ? start : first),
      null,
    );
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
