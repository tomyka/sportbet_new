import type { RuleSet } from '../rules/rule-set';

/** sportbet counts fill-ins over every tournament: one key for all. */
const LIFETIME = '*';

interface StatusState {
  readonly switchedOff: boolean;
  readonly adminHidden: boolean;
  readonly fillIns: ReadonlyMap<string, number>;
}

/**
 * Only what scoring needs to know about a player (PL-1, RA-4): whether
 * they are switched off for missed games, hidden by an admin, and how many
 * fill-ins count toward switching them off. Tournaments are named by any
 * key.
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
  readonly fillIns: ReadonlyMap<string, number>;

  private constructor(state: StatusState) {
    this.switchedOff = state.switchedOff;
    this.adminHidden = state.adminHidden;
    this.fillIns = state.fillIns;
    Object.freeze(this);
  }

  /** The fill-ins counted toward switching off, in that tournament. */
  fillInCount(tournament: string, rules: RuleSet): number {
    return this.fillIns.get(this.key(tournament, rules)) ?? 0;
  }

  /**
   * PL-1: sportbet switches a player off once they hold 5 fill-ins over all
   * their predictions; under R-7 after 20 in one tournament. A late
   * joiner's fill-ins never count (R-9); sportbet makes none.
   */
  afterFillIn(
    tournament: string,
    origin: 'fill-in' | 'late-fill-in',
    rules: RuleSet,
  ): PlayerStatus {
    if (origin === 'late-fill-in') {
      return this;
    }
    const key = this.key(tournament, rules);
    const count = (this.fillIns.get(key) ?? 0) + 1;
    return new PlayerStatus({
      switchedOff: this.switchedOff || count >= rules.switchOff.afterFillIns,
      adminHidden: this.adminHidden,
      fillIns: new Map([...this.fillIns, [key, count]]),
    });
  }

  /**
   * PL-1, RA-4: a real save switches the player back on. sportbet keeps
   * the count (the next fill-in switches them off again) and has one
   * switch, so a save also undoes an admin hide; under R-7 the tournament's
   * count resets, and under R-19 an admin hide stays.
   */
  afterRealPrediction(tournament: string, rules: RuleSet): PlayerStatus {
    const fillIns = new Map(this.fillIns);
    if (rules.switchOff.realPredictionResetsCount) {
      fillIns.delete(this.key(tournament, rules));
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
      fillIns: this.fillIns,
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

  private key(tournament: string, rules: RuleSet): string {
    return rules.switchOff.countedPer === 'lifetime' ? LIFETIME : tournament;
  }
}
