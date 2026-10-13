import type { Points } from '../points/points';
import type { SurvivalPoints } from '../recalculation/survival-points';
import type { RoundNumber, TeamId } from '../shared/ids';
import type { SurvivalRun } from './survival-run';

/** One round of a player's survival as the pages show it. */
export interface LedgerRound {
  readonly round: RoundNumber;
  readonly team: TeamId;
  readonly state: 'survived' | 'lost' | 'pending';
  /** The stored running total; null while pending. */
  readonly points: Points | null;
  /** R-34: an earlier pick still pending will change this total. */
  readonly provisional: boolean;
}

/**
 * One player's survival in round order, as the pages show it: a stored row
 * of the rule set's source with points decides its round (0 is the round
 * lost); a pick with no such row is pending. A stored row with null points
 * (a derived row waiting, SU-8) is never read: after a switch it may still
 * name the old team, and the picks say what is pending.
 */
export function survivalLedger(
  run: SurvivalRun,
  rows: readonly SurvivalPoints[],
): readonly LedgerRound[] {
  const byRound = new Map<RoundNumber, LedgerRound>();
  for (const pick of run.picks) {
    byRound.set(pick.round, {
      round: pick.round,
      team: pick.team,
      state: 'pending',
      points: null,
      provisional: false,
    });
  }
  for (const row of rows) {
    if (row.points === null) continue;
    byRound.set(row.round, {
      round: row.round,
      team: row.team,
      state: row.points.isPositive() ? 'survived' : 'lost',
      points: row.points,
      provisional: row.provisional,
    });
  }
  return Object.freeze([...byRound.values()].sort((a, b) => a.round - b.round));
}

/** The ledger's lines after the last loss: the current run, a loss starting a new one. */
export function runAfterLastLoss(
  lines: readonly LedgerRound[],
): readonly LedgerRound[] {
  return lines.slice(lines.findLastIndex((line) => line.state === 'lost') + 1);
}

/** "Iš eilės": a run's survived rounds; a pending round neither counts nor ends it. */
export function streakOf(run: readonly LedgerRound[]): number {
  return run.filter((line) => line.state === 'survived').length;
}
