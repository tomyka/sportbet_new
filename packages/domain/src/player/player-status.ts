import { defineRangeInvariant } from '../invariant/range-invariant';
import type { PredictionOrigin } from '../prediction/match-prediction';
import type { GameId, PlayerId, TournamentId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';

/**
 * PL-1, R-7, R-32: the fill-ins in one tournament after which a player is
 * switched off there (published on /rules, R-100).
 */
export const SWITCH_OFF_AFTER_FILL_INS = 20;

interface StatusState {
  /** The tournaments the player is switched off in. */
  readonly switchedOff: ReadonlySet<TournamentId>;
  readonly adminHidden: boolean;
  readonly fillIns: ReadonlyMap<TournamentId, number>;
}

/**
 * One write to a player's prediction row, as the history keeps it: a real
 * save by the player, or a fill-in the site made.
 */
export interface PredictionWrite {
  readonly tournament: TournamentId;
  readonly game: GameId;
  readonly origin: PredictionOrigin;
  readonly at: Instant;
}

/** A stored status read back (PlayerStatus.stored). */
export interface StoredStatus {
  /** The tournaments the player is switched off in for missed games (R-7). */
  readonly switchedOffIn: ReadonlySet<TournamentId>;
  readonly adminHidden: boolean;
  /** The fill-ins counted toward switching off, per tournament. */
  readonly fillIns: ReadonlyMap<TournamentId, number>;
}

export type StoredStatusRefusal = 'bad-count';

/** One tournament_players row of a player, as it is stored. */
export interface TournamentStatusRow {
  readonly tournament: TournamentId;
  readonly switchedOff: boolean;
  readonly adminHidden: boolean;
  readonly fillIns: number;
}

/** The fill-ins counted toward switching a player off: a whole number from 0. */
export const fillInCountInvariant = defineRangeInvariant({
  name: 'fill-in count',
  min: 0,
  accepts: [
    { label: 'none', value: 0 },
    { label: 'a few', value: 5 },
  ],
  refuses: [{ label: 'a negative count', value: -1 }],
});

/**
 * Only what scoring needs to know about a player (PL-1, RA-4): where they
 * are switched off for missed games, whether an admin hid them, and how
 * many fill-ins count toward switching them off. Under R-7 the switch and
 * the count are per tournament, so a player switched off in one tournament
 * is still listed and filled in in another, and a real save in one switches
 * them back on there only.
 */
export class PlayerStatus {
  static readonly NEW = new PlayerStatus({
    switchedOff: new Set(),
    adminHidden: false,
    fillIns: new Map(),
  });

  /** Hidden by an admin: a state of its own under R-19. */
  readonly adminHidden: boolean;
  readonly #switchedOff: ReadonlySet<TournamentId>;
  readonly #fillIns: ReadonlyMap<TournamentId, number>;

  private constructor(state: StatusState) {
    this.adminHidden = state.adminHidden;
    this.#switchedOff = new Set(state.switchedOff);
    this.#fillIns = new Map(state.fillIns);
    Object.freeze(this);
  }

  /** A stored status read back, bypassing the steps that made it. */
  static stored(
    stored: StoredStatus,
  ): Result<PlayerStatus, StoredStatusRefusal> {
    if (
      [...stored.fillIns].some(
        ([, count]) => !fillInCountInvariant.schema.safeParse(count).success,
      )
    ) {
      return refuse('bad-count');
    }
    return ok(
      new PlayerStatus({
        switchedOff: stored.switchedOffIn,
        adminHidden: stored.adminHidden,
        fillIns: stored.fillIns,
      }),
    );
  }

  /**
   * PL-1, R-5: the status the player's prediction writes lead to, in the
   * order they were made. It counts, per tournament, the fill-ins since that
   * tournament's last real save, switches the player off in a tournament at
   * its 20th and back on there at a real save in it (R-7). A late joiner's
   * fill-ins never count (R-9).
   *
   * A correction that removes the fill-ins a mistaken result made (R-5)
   * removes their writes from the history (historyAfterResultCorrection),
   * so the status is as if they had never been made. An admin hide is not
   * a prediction write: pass it as `adminHidden`.
   */
  static fromHistory(
    writes: readonly PredictionWrite[],
    options: { readonly adminHidden?: boolean } = {},
  ): PlayerStatus {
    const sinceSave = new Map<TournamentId, number>();
    const switchedOff = new Set<TournamentId>();
    const ordered = [...writes].sort((a, b) => a.at - b.at);
    for (const write of ordered) {
      if (write.origin === 'late-fill-in') continue;
      if (write.origin === 'real') {
        sinceSave.delete(write.tournament);
        switchedOff.delete(write.tournament);
        continue;
      }
      const count = (sinceSave.get(write.tournament) ?? 0) + 1;
      sinceSave.set(write.tournament, count);
      if (count >= SWITCH_OFF_AFTER_FILL_INS) switchedOff.add(write.tournament);
    }
    const fillIns = new Map<TournamentId, number>();
    for (const tournament of new Set(ordered.map((each) => each.tournament))) {
      fillIns.set(tournament, sinceSave.get(tournament) ?? 0);
    }
    const status = new PlayerStatus({
      switchedOff,
      adminHidden: false,
      fillIns,
    });
    return options.adminHidden === true ? status.hiddenByAdmin() : status;
  }

  /**
   * A player's tournament_players rows (every tournament they play) read as
   * one status, as `tournament`'s writer sees it: each row's switch and
   * count, and that tournament's admin hide. A row set that is refused
   * (PlayerStatus.stored) is a corrupt table and throws.
   */
  static fromRows(
    rows: readonly TournamentStatusRow[],
    tournament: TournamentId,
  ): PlayerStatus {
    const status = PlayerStatus.stored({
      switchedOffIn: new Set(
        rows.filter((row) => row.switchedOff).map((row) => row.tournament),
      ),
      adminHidden:
        rows.find((row) => row.tournament === tournament)?.adminHidden ?? false,
      fillIns: new Map(rows.map((row) => [row.tournament, row.fillIns])),
    });
    if (!status.ok) {
      throw new Error(
        `PlayerStatus.fromRows: a stored status is ${status.refusal}`,
      );
    }
    return status.value;
  }

  /**
   * The rows read (fromRows), written as this status: each row's switch and
   * count; `tournament`'s admin hide (the others kept).
   */
  toRows(
    rows: readonly TournamentStatusRow[],
    tournament: TournamentId,
  ): TournamentStatusRow[] {
    return rows.map((row) => ({
      tournament: row.tournament,
      switchedOff: this.isSwitchedOffIn(row.tournament),
      adminHidden:
        row.tournament === tournament ? this.adminHidden : row.adminHidden,
      fillIns: this.fillInCount(row.tournament),
    }));
  }

  /**
   * FI-4, R-5: a fill-in withdrawn because a mistaken result made it - it
   * stops counting (never below 0), and the player is switched on again in
   * that tournament once the count is below the threshold (off while at it
   * or above).
   */
  afterFillInWithdrawn(tournament: TournamentId): PlayerStatus {
    const count = Math.max(0, (this.#fillIns.get(tournament) ?? 0) - 1);
    const switchedOff = new Set(this.#switchedOff);
    if (count >= SWITCH_OFF_AFTER_FILL_INS) {
      switchedOff.add(tournament);
    } else {
      switchedOff.delete(tournament);
    }
    return new PlayerStatus({
      switchedOff,
      adminHidden: this.adminHidden,
      fillIns: new Map([...this.#fillIns, [tournament, count]]),
    });
  }

  /** PL-1, R-7: switched off for missed games in that tournament. */
  isSwitchedOffIn(tournament: TournamentId): boolean {
    return this.#switchedOff.has(tournament);
  }

  /** The fill-ins counted toward switching off, in that tournament. */
  fillInCount(tournament: TournamentId): number {
    return this.#fillIns.get(tournament) ?? 0;
  }

  /**
   * PL-1: after 20 fill-ins in one tournament the player is switched off in
   * that tournament only (R-7). A late joiner's fill-ins never count (R-9).
   */
  afterFillIn(
    tournament: TournamentId,
    origin: 'fill-in' | 'late-fill-in',
  ): PlayerStatus {
    if (origin === 'late-fill-in') {
      return this;
    }
    const count = (this.#fillIns.get(tournament) ?? 0) + 1;
    const switchedOff = new Set(this.#switchedOff);
    if (count >= SWITCH_OFF_AFTER_FILL_INS) {
      switchedOff.add(tournament);
    }
    return new PlayerStatus({
      switchedOff,
      adminHidden: this.adminHidden,
      fillIns: new Map([...this.#fillIns, [tournament, count]]),
    });
  }

  /**
   * PL-1, RA-4: a real save switches the player back on in its own
   * tournament only and resets that tournament's count (R-7); an admin hide
   * stays (R-19).
   */
  afterRealPrediction(tournament: TournamentId): PlayerStatus {
    const fillIns = new Map(this.#fillIns);
    fillIns.delete(tournament);
    const switchedOff = new Set(this.#switchedOff);
    switchedOff.delete(tournament);
    return new PlayerStatus({
      switchedOff,
      adminHidden: this.adminHidden,
      fillIns,
    });
  }

  /** An admin hide is a state of its own (R-19, RA-4). */
  hiddenByAdmin(): PlayerStatus {
    return new PlayerStatus({
      switchedOff: this.#switchedOff,
      adminHidden: true,
      fillIns: this.#fillIns,
    });
  }

  /**
   * RA-4: listed in that tournament's league tables. Hidden players keep
   * their points.
   */
  isListedIn(tournament: TournamentId): boolean {
    return !this.isSwitchedOffIn(tournament) && !this.adminHidden;
  }

  /**
   * R-32: a player switched off gets no fill-ins in the tournament they are
   * switched off in.
   */
  getsFillInsIn(tournament: TournamentId): boolean {
    return !this.isSwitchedOffIn(tournament);
  }
}

/**
 * RA-4: the players listed in the tournament's tables, from each one's
 * status (R-7, R-19): the league table, the medals and the leaderboard all
 * ask this one question.
 */
export function listedPlayers(
  statuses: ReadonlyMap<PlayerId, PlayerStatus>,
  tournament: TournamentId,
): ReadonlySet<PlayerId> {
  return new Set(
    [...statuses].flatMap(([player, status]) =>
      status.isListedIn(tournament) ? [player] : [],
    ),
  );
}
