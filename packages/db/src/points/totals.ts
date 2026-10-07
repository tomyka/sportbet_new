import {
  sumTournamentTotals,
  type PlayerId,
  type PointsRows,
  type RuleSet,
  type Tournament,
  type TournamentTotal,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadTournamentPoints } from './repository';

/** One tournament's totals under one rule set, read from its stored rows. */
export interface StoredTotals {
  /** Each player with a row of the rule set's source, summed (sumTournamentTotals). */
  readonly totals: readonly TournamentTotal[];
  /**
   * The players among them with a match points row: who PlayerTotals::
   * eligible lists (its inner join on point_results).
   */
  readonly scored: ReadonlySet<PlayerId>;
  /** The rows the totals are summed from. */
  readonly rows: PointsRows;
}

/**
 * The totals of the rule set's stored rows, from its own source only
 * (`points_source` is the rule set's name): the one place outside the
 * recalculation that sums stored rows (sumTournamentTotals). The hub's top
 * 5 and the league tables read it; `players` are totalled first, each with
 * zero if they have no row (a league table lists its whole roster).
 */
export async function loadTournamentTotals(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
  players: readonly PlayerId[] = [],
): Promise<StoredTotals> {
  const rows = await loadTournamentPoints(db, tournament, rules.name);
  return {
    totals: sumTournamentTotals(players, rows),
    scored: new Set(rows.matches.map(({ player }) => player)),
    rows,
  };
}
