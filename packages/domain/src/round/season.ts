import type { RuleSet } from '../rules/rule-set';
import type { GameId, RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { StandingsCloses } from '../standings/standings-view';
import type { Game } from './game';
import type { Round } from './round';

/**
 * Euroleague standings close once round 5 has been played out - its last
 * result entered (ST-2, sportbet a4618c6; it was the first game's kick-off).
 */
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
  /** The earliest tip-off of any game: when registration closes (PL-2). */
  readonly firstTipOff: Instant | null;
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

/**
 * PL-2: registration has not closed at `now` - it closes at the first game's
 * start (ChecksRegistrationDeadline, GameLock::hasStarted), under both rule
 * sets (R-128 reversed R-8). With no game it stays open.
 */
export function isRegistrationOpenWindowAt(
  window: Pick<RegistrationWindow, 'firstTipOff'>,
  now: Instant,
): boolean {
  return window.firstTipOff === null || now < window.firstTipOff;
}

/**
 * What a standings save or page reads of a season (ST-2): how its standings
 * close, and whether they are open.
 */
export type StandingsSeason = Pick<
  Season,
  'standingsCloses' | 'isStandingsOpen'
>;

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

  /** Every game by tip-off then id: the order games are played in. */
  inPlayOrder(): readonly Game[] {
    return [...this.games].sort(byTipOffThenId);
  }

  /** The games with a result, in play order (the order points are placed in, R-72). */
  scoredInPlayOrder(): readonly Game[] {
    return this.inPlayOrder().filter((game) => game.result !== null);
  }

  /** Each round with a scored game once, in season order. */
  scoredRounds(): readonly RoundNumber[] {
    return [
      ...new Set(
        this.games.filter((g) => g.result !== null).map((g) => g.round),
      ),
    ].sort((a, b) => a - b);
  }

  /** Whether the round is a knockout: false for a round the season does not have. */
  isKnockout(number: RoundNumber): boolean {
    return this.round(number)?.knockout ?? false;
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
   * ST-2: the round that closes standings - the first one at or after the
   * deadline round with any game, so a rescheduled round 5 cannot keep
   * standings open past round 6. Null: no such round, no deadline.
   */
  private standingsRound(): RoundNumber | null {
    const rounds = this.games
      .filter((game) => game.round >= this.standingsDeadlineRound)
      .map((game) => game.round);
    return rounds.sort((x, y) => x - y)[0] ?? null;
  }

  /**
   * ST-2, amended (sportbet a4618c6): standings close once every game of
   * their round has a result, not when it kicks off; a game with no result -
   * postponed too - keeps them open. There is no single instant to name: the
   * closing result can be entered at any time.
   */
  standingsCloses(): StandingsCloses {
    const round = this.standingsRound();
    if (round === null) return { state: 'never' };
    const closed = this.games
      .filter((game) => game.round === round)
      .every((game) => game.result !== null);
    return { state: closed ? 'closed' : 'open' };
  }

  isStandingsOpen(): boolean {
    return this.standingsCloses().state !== 'closed';
  }

  /** PL-2 (isRegistrationOpenWindowAt). */
  isRegistrationOpenAt(now: Instant): boolean {
    return isRegistrationOpenWindowAt(this.registrationWindow(), now);
  }
}
