import type { PredictionOrigin } from '../prediction/match-prediction';
import type { RuleSet } from '../rules/rule-set';
import { idKey, type GameId, type TournamentId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';

/** sportbet counts fill-ins over every tournament: one key for all. */
const LIFETIME = '*';

interface StatusState {
  readonly switchedOff: boolean;
  readonly adminHidden: boolean;
  readonly fillIns: ReadonlyMap<string, number>;
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

/** A stored status read back (PlayerStatus.of). */
export interface StoredStatus {
  readonly switchedOff: boolean;
  readonly adminHidden: boolean;
  /**
   * The fill-ins counted toward switching off, per tournament. Under the
   * sportbet set they are added up into its one lifetime count.
   */
  readonly fillIns: ReadonlyMap<TournamentId, number>;
}

export type StoredStatusRefusal = 'bad-count' | 'admin-hide-is-the-switch';

/**
 * Only what scoring needs to know about a player (PL-1, RA-4): whether
 * they are switched off for missed games, hidden by an admin, and how many
 * fill-ins count toward switching them off.
 */
export class PlayerStatus {
  static readonly NEW = new PlayerStatus({
    switchedOff: false,
    adminHidden: false,
    fillIns: new Map(),
  });

  /** Switched off for missed games (PL-1, R-7). */
  readonly switchedOff: boolean;
  /** Hidden by an admin: a state of its own under R-19. */
  readonly adminHidden: boolean;
  readonly #fillIns: ReadonlyMap<string, number>;

  private constructor(state: StatusState) {
    this.switchedOff = state.switchedOff;
    this.adminHidden = state.adminHidden;
    this.#fillIns = new Map(state.fillIns);
    Object.freeze(this);
  }

  /**
   * A stored status read back, bypassing the steps that made it. sportbet
   * stores one switch (`user_settings.active`) for missed games and an
   * admin hide alike, so a separate hide cannot be stored there.
   */
  static of(
    stored: StoredStatus,
    rules: RuleSet,
  ): Result<PlayerStatus, StoredStatusRefusal> {
    const counts = [...stored.fillIns];
    if (counts.some(([, count]) => !Number.isSafeInteger(count) || count < 0)) {
      return refuse('bad-count');
    }
    if (stored.adminHidden && !rules.adminHideSeparate) {
      return refuse('admin-hide-is-the-switch');
    }
    const fillIns = new Map<string, number>();
    for (const [tournament, count] of counts) {
      const key = keyFor(tournament, rules);
      fillIns.set(key, (fillIns.get(key) ?? 0) + count);
    }
    return ok(
      new PlayerStatus({
        switchedOff: stored.switchedOff,
        adminHidden: stored.adminHidden,
        fillIns,
      }),
    );
  }

  /**
   * PL-1, R-5: the status the player's prediction writes lead to, in the
   * order they were made. sportbet counts, over every tournament, the rows
   * that still hold a fill-in (COUNT(generated = 1): a real save over a
   * fill-in stops it counting), switches the player off when a fill-in
   * takes the count to 5 and on at any real save. The ruled set counts the
   * fill-ins since the tournament's last real save and switches off at 20
   * (R-7). A late joiner's fill-ins never count (R-9).
   *
   * A correction that removes the fill-ins a mistaken result made (R-5)
   * removes their writes from the history (historyAfterResultCorrection),
   * so the status is as if they had never been made. An admin hide is not
   * a prediction write: pass it as `adminHidden`.
   */
  static fromHistory(
    writes: readonly PredictionWrite[],
    rules: RuleSet,
    options: { readonly adminHidden?: boolean } = {},
  ): PlayerStatus {
    const rows = new Map<string, PredictionOrigin>();
    const sinceSave = new Map<TournamentId, number>();
    const counted = (tournament: TournamentId): number =>
      rules.switchOff.realPredictionResetsCount
        ? (sinceSave.get(tournament) ?? 0)
        : [...rows.values()].filter((origin) => origin === 'fill-in').length;
    let switchedOff = false;
    const ordered = [...writes].sort((a, b) => a.at - b.at);
    for (const write of ordered) {
      rows.set(idKey(write.tournament, write.game), write.origin);
      switch (write.origin) {
        case 'real':
          sinceSave.delete(write.tournament);
          switchedOff = false;
          break;
        case 'fill-in':
          sinceSave.set(
            write.tournament,
            (sinceSave.get(write.tournament) ?? 0) + 1,
          );
          switchedOff ||=
            counted(write.tournament) >= rules.switchOff.afterFillIns;
          break;
        case 'late-fill-in':
          break;
      }
    }
    const fillIns = new Map<string, number>();
    for (const tournament of new Set(ordered.map((each) => each.tournament))) {
      fillIns.set(keyFor(tournament, rules), counted(tournament));
    }
    const status = new PlayerStatus({
      switchedOff,
      adminHidden: false,
      fillIns,
    });
    return options.adminHidden === true ? status.hiddenByAdmin(rules) : status;
  }

  /** The fill-ins counted toward switching off, in that tournament. */
  fillInCount(tournament: TournamentId, rules: RuleSet): number {
    return this.#fillIns.get(keyFor(tournament, rules)) ?? 0;
  }

  /**
   * PL-1: sportbet switches a player off once they hold 5 fill-ins over all
   * their predictions; under R-7 after 20 in one tournament. A late
   * joiner's fill-ins never count (R-9); sportbet makes none.
   */
  afterFillIn(
    tournament: TournamentId,
    origin: 'fill-in' | 'late-fill-in',
    rules: RuleSet,
  ): PlayerStatus {
    if (origin === 'late-fill-in') {
      return this;
    }
    const key = keyFor(tournament, rules);
    const count = (this.#fillIns.get(key) ?? 0) + 1;
    return new PlayerStatus({
      switchedOff: this.switchedOff || count >= rules.switchOff.afterFillIns,
      adminHidden: this.adminHidden,
      fillIns: new Map([...this.#fillIns, [key, count]]),
    });
  }

  /**
   * PL-1, RA-4: a real save switches the player back on. sportbet keeps
   * the count (the next fill-in switches them off again) and has one
   * switch, so a save also undoes an admin hide; under R-7 the tournament's
   * count resets, and under R-19 an admin hide stays.
   */
  afterRealPrediction(tournament: TournamentId, rules: RuleSet): PlayerStatus {
    const fillIns = new Map(this.#fillIns);
    if (rules.switchOff.realPredictionResetsCount) {
      fillIns.delete(keyFor(tournament, rules));
    }
    return new PlayerStatus({
      switchedOff: false,
      adminHidden: rules.adminHideSeparate && this.adminHidden,
      fillIns,
    });
  }

  /** sportbet's admin hide is the same switch as missing games (RA-4). */
  hiddenByAdmin(rules: RuleSet): PlayerStatus {
    return new PlayerStatus({
      switchedOff: rules.adminHideSeparate ? this.switchedOff : true,
      adminHidden: rules.adminHideSeparate,
      fillIns: this.#fillIns,
    });
  }

  /** RA-4: listed in league tables. Hidden players keep their points. */
  isListed(): boolean {
    return !this.switchedOff && !this.adminHidden;
  }

  /** R-32 (sportbet's rule too): a switched-off player gets no fill-ins. */
  getsFillIns(): boolean {
    return !this.switchedOff;
  }
}

function keyFor(tournament: TournamentId, rules: RuleSet): string {
  return rules.switchOff.countedPer === 'lifetime' ? LIFETIME : tournament;
}
