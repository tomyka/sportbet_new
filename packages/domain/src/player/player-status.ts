import type { PredictionOrigin } from '../prediction/match-prediction';
import type { RuleSet } from '../rules/rule-set';
import { idKey, type GameId, type TournamentId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';

/**
 * sportbet counts fill-ins, and switches a player off, over every
 * tournament: one key for all. The ruled set keys both by tournament.
 */
const LIFETIME = '*';

interface StatusState {
  /** The keys (keyFor) the player is switched off under. */
  readonly switchedOff: ReadonlySet<string>;
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

/** A stored status read back (PlayerStatus.stored). */
export interface StoredStatus {
  /**
   * The tournaments the player is switched off in for missed games. Under
   * the sportbet set there is one switch (`user_settings.active`): switched
   * off in any tournament is switched off in all, so sportbetColumns.status
   * names any one tournament for an inactive player.
   */
  readonly switchedOffIn: ReadonlySet<TournamentId>;
  readonly adminHidden: boolean;
  /**
   * The fill-ins counted toward switching off, per tournament. Under the
   * sportbet set they are added up into its one lifetime count.
   */
  readonly fillIns: ReadonlyMap<TournamentId, number>;
}

export type StoredStatusRefusal = 'bad-count' | 'admin-hide-is-the-switch';

/**
 * Only what scoring needs to know about a player (PL-1, RA-4): where they
 * are switched off for missed games, whether an admin hid them, and how
 * many fill-ins count toward switching them off. sportbet has one switch
 * and one count over every tournament; under R-7 both are per tournament,
 * so a player switched off in one tournament is still listed and filled in
 * in another, and a real save in one switches them back on there only.
 */
export class PlayerStatus {
  static readonly NEW = new PlayerStatus({
    switchedOff: new Set(),
    adminHidden: false,
    fillIns: new Map(),
  });

  /** Hidden by an admin: a state of its own under R-19. */
  readonly adminHidden: boolean;
  readonly #switchedOff: ReadonlySet<string>;
  readonly #fillIns: ReadonlyMap<string, number>;

  private constructor(state: StatusState) {
    this.adminHidden = state.adminHidden;
    this.#switchedOff = new Set(state.switchedOff);
    this.#fillIns = new Map(state.fillIns);
    Object.freeze(this);
  }

  /**
   * A stored status read back, bypassing the steps that made it. sportbet
   * stores one switch (`user_settings.active`) for missed games and an
   * admin hide alike, so a separate hide cannot be stored there.
   */
  static stored(
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
        switchedOff: new Set(
          [...stored.switchedOffIn].map((each) => keyFor(each, rules)),
        ),
        adminHidden: stored.adminHidden,
        fillIns,
      }),
    );
  }

  /**
   * PL-1, R-5: the status the player's prediction writes lead to, in the
   * order they were made. sportbet counts, over every tournament, the rows
   * that still hold a fill-in (COUNT(generated = 1): a real save over a
   * fill-in stops it counting), switches the player off everywhere when a
   * fill-in takes the count to 5 and on at any real save. The ruled set
   * counts, per tournament, the fill-ins since that tournament's last real
   * save, switches the player off in a tournament at its 20th and back on
   * there at a real save in it (R-7). A late joiner's fill-ins never count
   * (R-9).
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
    const rows = new Map<string, PredictionWrite>();
    const sinceSave = new Map<TournamentId, number>();
    const counted = (tournament: TournamentId): number => {
      if (rules.switchOff.realPredictionResetsCount) {
        return sinceSave.get(tournament) ?? 0;
      }
      const key = keyFor(tournament, rules);
      return [...rows.values()].filter(
        (row) =>
          row.origin === 'fill-in' && keyFor(row.tournament, rules) === key,
      ).length;
    };
    const switchedOff = new Set<string>();
    const ordered = [...writes].sort((a, b) => a.at - b.at);
    for (const write of ordered) {
      rows.set(idKey(write.tournament, write.game), write);
      switch (write.origin) {
        case 'real':
          sinceSave.delete(write.tournament);
          switchedOff.delete(keyFor(write.tournament, rules));
          break;
        case 'fill-in':
          sinceSave.set(
            write.tournament,
            (sinceSave.get(write.tournament) ?? 0) + 1,
          );
          if (counted(write.tournament) >= rules.switchOff.afterFillIns) {
            switchedOff.add(keyFor(write.tournament, rules));
          }
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

  /**
   * PL-1, R-7: switched off for missed games in that tournament. sportbet's
   * one switch covers every tournament.
   */
  isSwitchedOffIn(tournament: TournamentId, rules: RuleSet): boolean {
    return this.#switchedOff.has(keyFor(tournament, rules));
  }

  /** The fill-ins counted toward switching off, in that tournament. */
  fillInCount(tournament: TournamentId, rules: RuleSet): number {
    return this.#fillIns.get(keyFor(tournament, rules)) ?? 0;
  }

  /**
   * PL-1: sportbet switches a player off once they hold 5 fill-ins over all
   * their predictions; under R-7 after 20 in one tournament, in that
   * tournament only. A late joiner's fill-ins never count (R-9); sportbet
   * makes none.
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
    const switchedOff = new Set(this.#switchedOff);
    if (count >= rules.switchOff.afterFillIns) {
      switchedOff.add(key);
    }
    return new PlayerStatus({
      switchedOff,
      adminHidden: this.adminHidden,
      fillIns: new Map([...this.#fillIns, [key, count]]),
    });
  }

  /**
   * PL-1, RA-4: a real save switches the player back on. sportbet keeps
   * the count (the next fill-in switches them off again) and has one
   * switch, so a save in any tournament switches them on everywhere and
   * also undoes an admin hide. Under R-7 the save switches them on in its
   * own tournament only and resets that tournament's count; under R-19 an
   * admin hide stays.
   */
  afterRealPrediction(tournament: TournamentId, rules: RuleSet): PlayerStatus {
    const key = keyFor(tournament, rules);
    const fillIns = new Map(this.#fillIns);
    if (rules.switchOff.realPredictionResetsCount) {
      fillIns.delete(key);
    }
    const switchedOff = new Set(this.#switchedOff);
    switchedOff.delete(key);
    return new PlayerStatus({
      switchedOff,
      adminHidden: rules.adminHideSeparate && this.adminHidden,
      fillIns,
    });
  }

  /** sportbet's admin hide is the same switch as missing games (RA-4). */
  hiddenByAdmin(rules: RuleSet): PlayerStatus {
    const switchedOff = new Set(this.#switchedOff);
    if (!rules.adminHideSeparate) {
      switchedOff.add(LIFETIME);
    }
    return new PlayerStatus({
      switchedOff,
      adminHidden: rules.adminHideSeparate,
      fillIns: this.#fillIns,
    });
  }

  /**
   * RA-4: listed in that tournament's league tables. Hidden players keep
   * their points.
   */
  isListedIn(tournament: TournamentId, rules: RuleSet): boolean {
    return !this.isSwitchedOffIn(tournament, rules) && !this.adminHidden;
  }

  /**
   * R-32 (sportbet's rule too): a player switched off gets no fill-ins,
   * under R-7 in the tournament they are switched off in.
   */
  getsFillInsIn(tournament: TournamentId, rules: RuleSet): boolean {
    return !this.isSwitchedOffIn(tournament, rules);
  }
}

function keyFor(tournament: TournamentId, rules: RuleSet): string {
  return rules.switchOff.countedPer === 'lifetime' ? LIFETIME : tournament;
}
