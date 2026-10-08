import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { StandingsTarget } from './predict-row';

export type ReorderRefusal = 'not-yours' | 'closed' | 'mismatch';

export interface PlacedTeam {
  readonly team: TeamId;
  readonly place: number;
}

/**
 * reorderPredictionStandingsUser: the whole table in its new order. With
 * no target the order is not the player's; closed from its season's deadline
 * (ST-2); the order must name every team of the tournament once
 * (StandingsReorder::accepts). Accepted: each team's place, 1.. in posted
 * order - only places: ticks and final places are untouched.
 */
export function reorderStandings(input: {
  readonly order: readonly TeamId[];
  readonly target: Pick<StandingsTarget, 'teams' | 'season'> | null;
  readonly now: Instant;
}): Result<readonly PlacedTeam[], ReorderRefusal> {
  const { order, target, now } = input;
  if (target === null) return refuse('not-yours');
  if (!target.season.isStandingsOpenAt(now)) return refuse('closed');
  const named = new Set(order);
  if (
    named.size !== order.length ||
    order.length !== target.teams.length ||
    !target.teams.every((team) => named.has(team))
  ) {
    return refuse('mismatch');
  }
  return ok(order.map((team, index) => ({ team, place: index + 1 })));
}
