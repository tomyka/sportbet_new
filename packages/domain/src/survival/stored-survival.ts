import { Points, pointsWhole } from '../points/points';
import type { RuleSet } from '../rules/rule-set';
import type { PlayerId, RoundNumber, TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import { survivalPays } from './survival-fold';

/**
 * One tournament's `point_survivals` row as sportbet's full recalculation
 * reads it (PointSurvivalController::recalculateSurvivalPoints): the stored
 * row, its round's `event_day`, and the `away_team_id` of the picked team's
 * game in that round. A team that played twice in its round comes as two
 * rows with the same id, in the order the query returned them. Internal:
 * the recalculation joins each stored row to its game.
 */
export interface JoinedSurvivalRow {
  /** `point_survivals.id`. */
  readonly id: number;
  readonly player: PlayerId;
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
 * 1ac955f). Every stored row is rewritten from the stored rows alone, never
 * from results or picks: per player, in round order (the rows are one
 * tournament's, so no run crosses tournaments, #217), a stored 0 stays 0
 * and ends the run, and every other row takes the next
 * running total, 12 when its stored team was the away side of its game and
 * 10 otherwise (also when it had no game). A row seen twice is folded once,
 * by its first game. So a knock-out once stored is permanent (SU-9), and a
 * re-picked team is repaid in the round it was first picked (SU-5).
 *
 * Rows may come in any order; each run is folded by round, keeping the
 * given order within a round. Only a rule set that scores survival from
 * the stored rows (`survivalScoredFromStoredRows`) uses this: the ruled
 * set folds the pick history (foldSurvival, R-5), so asking for a
 * refold under it is a programmer error, thrown rather than refused.
 */
export function refoldStoredSurvival(
  rows: readonly JoinedSurvivalRow[],
  rules: RuleSet,
): Result<readonly RefoldedSurvival[], 'one-id-two-rows'> {
  if (!rules.survivalScoredFromStoredRows) {
    throw new Error(
      'refoldStoredSurvival: this rule set scores survival from the pick history',
    );
  }
  const once = rowsOnce(rows);
  if (!once.ok) return once;
  const ordered = [...once.value].sort((a, b) => a.round - b.round);
  return ok(Object.freeze(runningTotals(ordered)));
}

/** Two rows under one id are the same row: the same player, round, team and points. */
const sameRow = (a: JoinedSurvivalRow, b: JoinedSurvivalRow): boolean =>
  a.player === b.player &&
  a.round === b.round &&
  a.team === b.team &&
  a.storedPoints.equals(b.storedPoints);

/**
 * Each stored row once, by its first game: a row seen twice (joined to two
 * games) is folded once; one id on two different rows is refused.
 */
function rowsOnce(
  rows: readonly JoinedSurvivalRow[],
): Result<readonly JoinedSurvivalRow[], 'one-id-two-rows'> {
  const firstById = new Map<number, JoinedSurvivalRow>();
  for (const row of rows) {
    const first = firstById.get(row.id);
    if (first === undefined) firstById.set(row.id, row);
    else if (!sameRow(first, row)) return refuse('one-id-two-rows');
  }
  return ok([...firstById.values()]);
}

/**
 * The rows, in round order, refolded into each player's running total: a
 * stored 0 resets it, any other row adds what the pick pays.
 */
function runningTotals(
  ordered: readonly JoinedSurvivalRow[],
): RefoldedSurvival[] {
  const running = new Map<PlayerId, number>();
  const refolded: RefoldedSurvival[] = [];
  for (const row of ordered) {
    let total = running.get(row.player) ?? 0;
    if (row.storedPoints.equals(Points.ZERO)) {
      total = 0;
    } else {
      total += survivalPays(row.awayTeam, row.team);
    }
    running.set(row.player, total);
    refolded.push(Object.freeze({ id: row.id, points: pointsWhole(total) }));
  }
  return refolded;
}
