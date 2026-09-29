import { Points, pointsWhole } from '../points/points';
import type { RuleSet } from '../rules/rule-set';
import {
  idKey,
  type PlayerId,
  type RoundNumber,
  type TeamId,
  type TournamentId,
} from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import { survivalPays } from './survival-fold';

/**
 * One `point_survivals` row as sportbet's full recalculation reads it
 * (PointSurvivalController::recalculateSurvivalPoints): the stored row,
 * its round's `event_day`, and the `away_team_id` of the picked team's game
 * in that round. A team that played twice in its round comes as two rows
 * with the same id, in the order the query returned them.
 */
export interface StoredSurvivalRow {
  /** `point_survivals.id`. */
  readonly id: number;
  readonly player: PlayerId;
  /** The run's tournament (#217). */
  readonly tournament: TournamentId;
  readonly round: RoundNumber;
  /** `point_survivals.team_id`: the team the round was scored for. */
  readonly team: TeamId;
  /** `point_survivals.survival_points`: 0 is the round that was lost. */
  readonly storedPoints: Points;
  /** The team's game's away side, or null when it had no game that round. */
  readonly awayTeam: TeamId | null;
}

export interface RefoldedSurvival {
  readonly id: number;
  readonly points: Points;
}

/**
 * SU-10, sportbet only: SurvivalRun::fold (app/Support/SurvivalRun.php at
 * 0da316f). Every stored row is rewritten from the stored rows alone, never
 * from results or picks: per player per tournament (#217), in round order,
 * a stored 0 stays 0 and ends the run, and every other row takes the next
 * running total, 12 when its stored team was the away side of its game and
 * 10 otherwise (also when it had no game). A row seen twice is folded once,
 * by its first game. So a knock-out once stored is permanent (SU-9), and a
 * re-picked team is repaid in the round it was first picked (SU-5).
 *
 * Rows may come in any order; each run is folded by round, keeping the
 * given order within a round. Only a rule set that scores survival from
 * the stored rows (`survivalScoredFromStoredRows`) uses this: the ruled
 * set folds the pick history (SurvivalRun.fold, R-5), so asking for a
 * refold under it is a programmer error, thrown rather than refused.
 */
export function refoldStoredSurvival(
  rows: readonly StoredSurvivalRow[],
  rules: RuleSet,
): Result<readonly RefoldedSurvival[], 'one-id-two-rows'> {
  if (!rules.survivalScoredFromStoredRows) {
    throw new Error(
      'refoldStoredSurvival: this rule set scores survival from the pick history',
    );
  }
  const firstById = new Map<number, StoredSurvivalRow>();
  for (const row of rows) {
    const first = firstById.get(row.id);
    if (first === undefined) {
      firstById.set(row.id, row);
    } else if (
      first.player !== row.player ||
      first.tournament !== row.tournament ||
      first.round !== row.round ||
      first.team !== row.team ||
      !first.storedPoints.equals(row.storedPoints)
    ) {
      return refuse('one-id-two-rows');
    }
  }
  const ordered = [...firstById.values()].sort((a, b) => a.round - b.round);
  const running = new Map<string, number>();
  const refolded: RefoldedSurvival[] = [];
  for (const row of ordered) {
    const run = idKey(row.player, row.tournament);
    let total = running.get(run) ?? 0;
    if (row.storedPoints.equals(Points.ZERO)) {
      total = 0;
    } else {
      total += survivalPays(row.awayTeam, row.team);
    }
    running.set(run, total);
    refolded.push(Object.freeze({ id: row.id, points: pointsWhole(total) }));
  }
  return ok(Object.freeze(refolded));
}
