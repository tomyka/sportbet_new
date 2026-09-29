import type { RuleSet } from '../rules/rule-set';
import type { GameId, RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { Score } from '../score/score';

export interface GameSchedule {
  readonly id: GameId;
  readonly round: RoundNumber;
  readonly home: TeamId;
  readonly away: TeamId;
  readonly tipOff: Instant;
}

interface GameState extends GameSchedule {
  readonly result: Score | null;
  readonly recordedWinner: TeamId | null;
  readonly lockedSince: Instant | null;
}

export type ResultRefusal = 'level-result' | 'winner-not-in-game';

/** One game: its teams, its tip-off, and its result once entered. */
export class Game {
  readonly id: GameId;
  readonly round: RoundNumber;
  readonly home: TeamId;
  readonly away: TeamId;
  readonly tipOff: Instant;
  readonly result: Score | null;
  /**
   * The team the admin recorded as going through a level result in a
   * knockout-flagged round (sportbet's `game_winner_id`, MS-10). Only the
   * sportbet set can hold a level result.
   */
  readonly recordedWinner: TeamId | null;
  /**
   * The tip-off a game had locked at before it was moved later. Under R-13
   * such a game stays closed (LR-2).
   */
  readonly lockedSince: Instant | null;

  private constructor(state: GameState) {
    this.id = state.id;
    this.round = state.round;
    this.home = state.home;
    this.away = state.away;
    this.tipOff = state.tipOff;
    this.result = state.result;
    this.recordedWinner = state.recordedWinner;
    this.lockedSince = state.lockedSince;
    Object.freeze(this);
  }

  static schedule(schedule: GameSchedule): Result<Game, 'same-team-twice'> {
    if (schedule.home === schedule.away) {
      return refuse('same-team-twice');
    }
    return ok(
      new Game({
        ...schedule,
        result: null,
        recordedWinner: null,
        lockedSince: null,
      }),
    );
  }

  /**
   * LR-1: open while it has no result, has not locked, and its tip-off is
   * still in the future. At the tip-off second it is closed.
   */
  isOpenAt(now: Instant): boolean {
    return (
      this.result === null && this.lockedSince === null && now < this.tipOff
    );
  }

  hasTippedOffAt(now: Instant): boolean {
    return now >= this.tipOff;
  }

  /** R-38: a level result is refused unless the rule set allows it. */
  withResult(
    score: Score,
    rules: RuleSet,
    recordedWinner: TeamId | null = null,
  ): Result<Game, ResultRefusal> {
    if (score.isLevel() && !rules.levelResultAllowed) {
      return refuse('level-result');
    }
    if (recordedWinner !== null && !this.plays(recordedWinner)) {
      return refuse('winner-not-in-game');
    }
    return ok(this.with({ result: score, recordedWinner }));
  }

  /** The result cleared: the game is unscored again (LR-5). */
  withoutResult(): Game {
    return this.with({ result: null, recordedWinner: null });
  }

  /**
   * LR-2: the game moves to a new tip-off. sportbet computes the lock from
   * the new date alone, so a moved game always reopens; under R-13 a game
   * whose original tip-off had passed stays closed.
   */
  reschedule(tipOff: Instant, now: Instant, rules: RuleSet): Game {
    const locksNow =
      rules.movedGameReopens === 'only-before-tip-off' &&
      this.lockedSince === null &&
      this.hasTippedOffAt(now);
    return this.with({
      tipOff,
      lockedSince: locksNow ? this.tipOff : this.lockedSince,
    });
  }

  plays(team: TeamId): boolean {
    return team === this.home || team === this.away;
  }

  /** The team that won by the score, or null when unscored or level. */
  winner(): TeamId | null {
    if (this.result === null) return null;
    switch (this.result.outcome()) {
      case 'home':
        return this.home;
      case 'away':
        return this.away;
      case 'level':
        return null;
    }
  }

  private with(changes: Partial<GameState>): Game {
    return new Game({
      id: this.id,
      round: this.round,
      home: this.home,
      away: this.away,
      tipOff: this.tipOff,
      result: this.result,
      recordedWinner: this.recordedWinner,
      lockedSince: this.lockedSince,
      ...changes,
    });
  }
}
