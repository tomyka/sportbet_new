import {
  advanceIdentitySequences,
  countPointsRows,
  recalculateUnderRuleSet,
  savePlayers,
  saveTournamentSnapshot,
  type Db,
  type PointsSource,
  type PointsTable,
  type RuleSetRecalculationRefusal,
} from '@sportbet/db';
import {
  ruledRules,
  sportbetRules,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import type { Mapped } from './map';

/**
 * Writes the mapped rows in one transaction: the players, then each
 * tournament's snapshot (saveTournamentSnapshot, which owns the foreign-key
 * order and the check that every row is the tournament's), then moves every
 * identity sequence past the loaded ids. Every save is an upsert or a
 * replace, so loading the same rows twice leaves the same rows.
 */
export async function loadMapped(db: Db, mapped: Mapped): Promise<void> {
  await db.transaction(async (tx) => {
    await savePlayers(tx, mapped.players);
    for (const each of mapped.tournaments) {
      await saveTournamentSnapshot(tx, each);
    }
    await advanceIdentitySequences(tx);
  });
}

/** One recalculation the reader ran: refused, or saved under its rule set. */
export interface Recalculation {
  readonly tournament: number;
  readonly rules: RuleSet['name'];
  /** The inputs' refusal, or the recalculation's. */
  readonly refusal: RuleSetRecalculationRefusal | null;
}

/** The rule sets each loaded tournament is recalculated under. */
const RULE_SETS: readonly RuleSet[] = [sportbetRules, ruledRules];

/**
 * Each loaded tournament recalculated under both rule sets, each saved
 * under its own name (recalculateUnderRuleSet). A refusal is reported, not
 * thrown.
 */
export async function recalculateLoaded(
  db: Db,
  tournaments: readonly Tournament[],
): Promise<Recalculation[]> {
  const done: Recalculation[] = [];
  for (const tournament of tournaments) {
    for (const rules of RULE_SETS) {
      done.push({
        tournament: tournament.id,
        rules: rules.name,
        refusal: await recalculateUnderRuleSet(db, tournament, rules),
      });
    }
  }
  return done;
}

/** The rows of each source in each points table, per loaded tournament. */
export async function pointsRowCounts(
  db: Db,
  tournaments: readonly Tournament[],
): Promise<
  {
    readonly tournament: number;
    readonly rows: Record<PointsTable, Record<PointsSource, number>>;
  }[]
> {
  const counts = [];
  for (const tournament of tournaments) {
    counts.push({
      tournament: tournament.id,
      rows: await countPointsRows(db, tournament),
    });
  }
  return counts;
}
