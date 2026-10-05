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
  /**
   * When the tournament ends (R-21), or null when it has no end date yet:
   * sportbet leaves it optional, and a Euroleague season's depends on its
   * playoffs (the owner, 2026-09-30).
   */
  readonly endsAt: Instant | null;
  /** The tournament's own standings deadline round, if an admin set one. */
  readonly standingsDeadlineRound?: RoundNumber;
}

interface SeasonState {
  readonly rounds: readonly Round[];
  readonly games: readonly Game[];
  readonly endsAt: Instant | null;
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

/**
 * What R-21 (finished) and PL-2 (registration closes) read of a season, and
 * nothing else: what the database can sum up per tournament without loading
 * its games (isRegistrationOpen in packages/db).
 */
export interface RegistrationWindow {
  readonly endsAt: Instant | null;
  /** How many games the season has. */
  readonly games: number;
  /** Every game has a result (true with none). */
  readonly allScored: boolean;
  /** The earliest tip-off of any game: sportbet's close. */
  readonly firstTipOff: Instant | null;
  /** ST-2's deadline: the ruled close (R-8). */
  readonly standingsDeadline: Instant | null;
}

/**
 * R-21: the end date has passed and every game is scored. With no end
 * date it stays open until an admin sets one (the owner, 2026-10-01);
 * sportbet too finishes one by date only when its end_date is set
 * (Tournament::effectiveStatus).
 */
export function isFinishedWindowAt(
  window: Pick<RegistrationWindow, 'endsAt' | 'allScored'>,
  now: Instant,
): boolean {
  return window.endsAt !== null && now >= window.endsAt && window.allScored;
}

/** PL-2: sportbet closes at the first game; ruled at the standings deadline (R-8). */
export function registrationClosesAt(
  window: RegistrationWindow,
  rules: RuleSet,
): Instant | null {
  switch (rules.registrationClosesAt) {
    case 'first-game':
      return window.firstTipOff;
    case 'standings-deadline':
      return window.standingsDeadline;
  }
}

/** PL-2: registration has not closed at `now` under the rule set. */
export function isRegistrationOpenWindowAt(
  window: RegistrationWindow,
  now: Instant,
  rules: RuleSet,
): boolean {
  const closes = registrationClosesAt(window, rules);
  return closes === null || now < closes;
}

/** One tournament's rounds and games. */
export class Season {
  readonly rounds: readonly Round[];
  readonly games: readonly Game[];
  readonly endsAt: Instant | null;
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

  /** The earliest tip-off of all the season's games, or null with none. */
  firstTipOff(): Instant | null {
    return earliest(this.games)?.tipOff ?? null;
  }

  /** Whether any game has a result (#129's anyScoredGame). */
  hasAnyResult(): boolean {
    return this.games.some((game) => game.result !== null);
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

  /** What R-21 and PL-2 read of the season (RegistrationWindow). */
  registrationWindow(): RegistrationWindow {
    return {
      endsAt: this.endsAt,
      games: this.games.length,
      allScored: this.games.every((game) => game.result !== null),
      firstTipOff: this.firstTipOff(),
      standingsDeadline: this.standingsDeadline(),
    };
  }

  /** R-21 (isFinishedWindowAt). */
  isFinishedAt(now: Instant): boolean {
    return isFinishedWindowAt(
      {
        endsAt: this.endsAt,
        allScored: this.games.every((game) => game.result !== null),
      },
      now,
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

  /** PL-2 (registrationClosesAt). */
  registrationClosesAt(rules: RuleSet): Instant | null {
    return registrationClosesAt(this.registrationWindow(), rules);
  }

  /** PL-2 (isRegistrationOpenWindowAt). */
  isRegistrationOpenAt(now: Instant, rules: RuleSet): boolean {
    return isRegistrationOpenWindowAt(this.registrationWindow(), now, rules);
  }
}
