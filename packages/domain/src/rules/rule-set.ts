/**
 * The two rule sets' names. The database's `points_source` enum is built
 * from this list (plus `production`, the rows as production stored them).
 */
export const RULE_SET_NAMES = ['sportbet', 'ruled'] as const;

export type RuleSetName = (typeof RULE_SET_NAMES)[number];

/**
 * Every point where sportbet's rules and the owner's rulings differ: none is
 * left, so a rule set is only the name its stored rows carry
 * (`points_source`).
 */
export interface RuleSet {
  readonly name: RuleSetName;
}

/** What production's stored points were computed with (sportbet at 1618164). */
export const sportbetRules: RuleSet = Object.freeze({ name: 'sportbet' });

/** sportbet plus the owner's rulings: what sportbet_new goes live with. */
export const ruledRules: RuleSet = Object.freeze({ name: 'ruled' });
