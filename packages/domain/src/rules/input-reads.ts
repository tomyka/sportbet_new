import type { RuleSet } from './rule-set';

/**
 * What a recalculation reads besides the tournament's own rows, always
 * named by the caller: the odds each game was scored with as production
 * stored them (`'stored'`, CO-7) or computed from the votes; survival from
 * production's stored rows (`'stored-rows'`, SU-10) or from the picks.
 * Which a rule set reads is inputReadsOf's.
 */
export interface InputReads {
  readonly odds: 'stored' | 'from-votes';
  readonly survival: 'stored-rows' | 'picks';
}

/**
 * What a recalculation under `rules` reads, from the rule set alone.
 * Survival: the stored rows when the set refolds them
 * (`survivalScoredFromStoredRows`, SU-10), else the picks. Odds: the ones
 * production stored when the set can score a game without a stored row
 * (`missingOddsScoreAtOne`, CO-5: a missing row exists only where the
 * stored odds are read, as sportbet's full recalculation reads them, LR-5,
 * CO-7); else computed from the votes, as a set without a missing row
 * always has them.
 */
export function inputReadsOf(rules: RuleSet): InputReads {
  return {
    odds: rules.missingOddsScoreAtOne ? 'stored' : 'from-votes',
    survival: rules.survivalScoredFromStoredRows ? 'stored-rows' : 'picks',
  };
}
