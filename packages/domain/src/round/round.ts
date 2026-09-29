import type { RuleSet } from '../rules/rule-set';
import type { RoundNumber } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import type { Rate } from '../score/score';
import type { Stage } from './stage';

export interface RoundInput {
  readonly number: RoundNumber;
  readonly stage: Stage;
  /** Multiplies the round's match points and serija bonus (LR-4). */
  readonly rate: Rate;
  /** Survival picks are played in this round (SU-7). */
  readonly survival: boolean;
  /**
   * sportbet's per-round knockout flag (MS-8, MS-10). An admin can set it;
   * a wrong call then stores odds 0, and a level result pays half credit.
   */
  readonly knockout: boolean;
}

export type RoundRefusal =
  'rate-does-not-match-stage' | 'survival-outside-regular-season';

/** One round of a tournament (sportbet's event), as the admin set it up. */
export class Round {
  readonly number: RoundNumber;
  readonly stage: Stage;
  readonly rate: Rate;
  readonly survival: boolean;
  readonly knockout: boolean;

  private constructor(input: RoundInput) {
    this.number = input.number;
    this.stage = input.stage;
    this.rate = input.rate;
    this.survival = input.survival;
    this.knockout = input.knockout;
    Object.freeze(this);
  }

  static create(
    input: RoundInput,
    rules: RuleSet,
  ): Result<Round, RoundRefusal> {
    if (
      rules.stageRates !== null &&
      rules.stageRates[input.stage] !== input.rate.value
    ) {
      return refuse('rate-does-not-match-stage');
    }
    if (
      rules.survivalRegularSeasonOnly &&
      input.survival &&
      input.stage !== 'regular'
    ) {
      return refuse('survival-outside-regular-season');
    }
    return ok(new Round(input));
  }
}
