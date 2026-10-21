import type { SurvivalRow } from './survival-fold';

/**
 * The lines of a player's survival (`foldSurvival` over their picks, in round
 * order) after the last loss: the current run, a loss starting a new one.
 */
export function runAfterLastLoss(
  lines: readonly SurvivalRow[],
): readonly SurvivalRow[] {
  return lines.slice(lines.findLastIndex((line) => line.state === 'lost') + 1);
}

/** "Iš eilės": a run's survived rounds; a pending round neither counts nor ends it. */
export function streakOf(run: readonly SurvivalRow[]): number {
  return run.filter((line) => line.state === 'survived').length;
}
