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
  readonly postponed: boolean;
}

/** A game row as stored (Game.stored): its schedule and every state field. */
export type StoredGame = GameState;

/**
 * A negative score cannot reach a game: `Score.of` refuses it under both
 * sets (R-41); sportbet's own UpdateResultRequest does too, but for its
 * postponed placeholder -1 : -1 (f3e08eb), which the reader stops on.
 */
export type ResultRefusal = 'level-result' | 'winner-not-in-game';

export type StoredGameRefusal =
  | 'same-team-twice'
  | 'winner-not-in-game'
  | 'winner-without-result'
  | 'postponed-with-result';

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
   * knockout-flagged round (sportbet's `game_winner_id`, MS-10). Only a
   * stored game can hold a level result: sportbet saved them until
   * sportbet#274.
   */
  readonly recordedWinner: TeamId | null;
  /**
   * The tip-off a game had locked at before it was moved later. Under R-13
   * such a game stays closed (LR-2).
   */
  readonly lockedSince: Instant | null;
  /**
   * R-41: postponed and waiting for a new date. The game keeps the tip-off
   * it had, for ordering only, but has no result, is never open, has not
   * tipped off and is never a round's next game (R-6); a survival pick on
   * it waits (R-12). sportbet has no such state: its old -1 marker is
   * refused by its own validation (UpdateResultRequest, min:0) and
   * production holds none, so under the sportbet set a postponed game is
   * one without a result, and it holds the round (LR-3).
   */
  readonly postponed: boolean;

  private constructor(state: GameState) {
    this.id = state.id;
    this.round = state.round;
    this.home = state.home;
    this.away = state.away;
    this.tipOff = state.tipOff;
    this.result = state.result;
    this.recordedWinner = state.recordedWinner;
    this.lockedSince = state.lockedSince;
    this.postponed = state.postponed;
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
        postponed: false,
      }),
    );
  }

  /**
   * A stored game read back as it was stored, without replaying the
   * postponements and moves that made it: a lock (R-13) and a postponement
   * (R-41) are fields of the row. A level result is kept, as Round.stored
   * keeps a rate (sportbet stored them until sportbet#274, MS-10; R-38
   * refuses one on entry). Only states no transition reaches are refused:
   * one team on both sides, a recorded winner outside the game or without a
   * result (withoutResult clears both), and a postponed game with a result
   * (a result ends the postponement).
   *
   * A sportbet row has neither field: its games reopen when moved (LR-2)
   * and it has no postponed state (R-41), so its rows read back with
   * `lockedSince` null and `postponed` false.
   */
  static stored(row: StoredGame): Result<Game, StoredGameRefusal> {
    if (row.home === row.away) {
      return refuse('same-team-twice');
    }
    if (row.recordedWinner !== null) {
      if (row.recordedWinner !== row.home && row.recordedWinner !== row.away) {
        return refuse('winner-not-in-game');
      }
      if (row.result === null) {
        return refuse('winner-without-result');
      }
    }
    if (row.postponed && row.result !== null) {
      return refuse('postponed-with-result');
    }
    return ok(new Game({ ...row }));
  }

  /**
   * LR-1: open while it has no result, has not locked, is not postponed
   * (R-41), and its tip-off is still in the future. At the tip-off second
   * it is closed.
   */
  isOpenAt(now: Instant): boolean {
    return (
      this.result === null &&
      this.lockedSince === null &&
      !this.postponed &&
      now < this.tipOff
    );
  }

  /**
   * A postponed game has not tipped off, unless it was postponed after its
   * tip-off and R-13 locked it there (R-41).
   */
  hasTippedOffAt(now: Instant): boolean {
    if (this.postponed) {
      return this.lockedSince !== null;
    }
    return now >= this.tipOff;
  }

  /**
   * R-41: the game is postponed with no new date. Under R-13 a game
   * postponed after its tip-off locks at that tip-off, so a new date never
   * reopens it; one postponed before its tip-off reopens with its new date.
   */
  postpone(now: Instant, rules: RuleSet): Result<Game, 'already-scored'> {
    if (this.result !== null) {
      return refuse('already-scored');
    }
    return ok(
      this.with({
        postponed: true,
        lockedSince: this.locksWhenMovedAt(now, rules)
          ? this.tipOff
          : this.lockedSince,
      }),
    );
  }

  /**
   * R-38: a level result is refused (sportbet too since sportbet#274); one
   * stored before is read back by `stored`.
   */
  withResult(
    score: Score,
    recordedWinner: TeamId | null = null,
  ): Result<Game, ResultRefusal> {
    if (score.isLevel()) {
      return refuse('level-result');
    }
    if (recordedWinner !== null && !this.plays(recordedWinner)) {
      return refuse('winner-not-in-game');
    }
    return ok(this.with({ result: score, recordedWinner, postponed: false }));
  }

  /** The result cleared: the game is unscored again (LR-5). */
  withoutResult(): Game {
    return this.with({ result: null, recordedWinner: null });
  }

  /**
   * LR-2: the game moves to a new tip-off. sportbet computes the lock from
   * the new date alone, so a moved game always reopens; under R-13 a game
   * whose original tip-off had passed stays closed. A postponed game's lock
   * was decided when it was postponed (R-41); its new date ends the
   * postponement.
   */
  reschedule(tipOff: Instant, now: Instant, rules: RuleSet): Game {
    const locksNow = !this.postponed && this.locksWhenMovedAt(now, rules);
    return this.with({
      tipOff,
      lockedSince: locksNow ? this.tipOff : this.lockedSince,
      postponed: false,
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

  /** R-13: a game moved (or postponed) at `now` stays locked at its tip-off. */
  private locksWhenMovedAt(now: Instant, rules: RuleSet): boolean {
    return (
      rules.movedGameReopens === 'only-before-tip-off' &&
      this.lockedSince === null &&
      this.hasTippedOffAt(now)
    );
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
      postponed: this.postponed,
      ...changes,
    });
  }
}
