import {
  advanceIdentitySequences,
  countPointsRows,
  recalculateLocked,
  savePlayerSettings,
  savePlayers,
  saveTournamentProfile,
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
 * order and the check that every row is the tournament's) and its profile
 * (saveTournamentProfile), then moves every identity sequence past the
 * loaded ids. Every save is an upsert or a replace, so loading the same
 * rows twice leaves the same rows.
 */
export async function loadMapped(db: Db, mapped: Mapped): Promise<void> {
  await db.transaction(async (tx) => {
    await savePlayers(tx, mapped.players);
    await savePlayerSettings(tx, mapped.settings);
    for (const each of mapped.tournaments) {
      await saveTournamentSnapshot(tx, each);
      await saveTournamentProfile(tx, each.tournament, each.profile);
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
 * under its own name (recalculateLocked: under the tournament's
 * recalculation lock, as every recalculating writer), and timed with `timer`
 * (milliseconds): a notice per recalculation, "recalculation: <slug>
 * under <rule set> took <n> ms" - a slug and a number only (slice 7, so
 * the owner's run records production's timings). A refusal is reported,
 * not thrown.
 */
export async function recalculateLoadedTimed(
  db: Db,
  tournaments: readonly Tournament[],
  timer: () => number = () => performance.now(),
): Promise<{ recalculations: Recalculation[]; notices: string[] }> {
  const recalculations: Recalculation[] = [];
  const notices: string[] = [];
  for (const tournament of tournaments) {
    for (const rules of RULE_SETS) {
      const started = timer();
      const refusal = await recalculateLocked(db, tournament, rules);
      const ms = Math.round(timer() - started);
      recalculations.push({
        tournament: tournament.id,
        rules: rules.name,
        refusal,
      });
      notices.push(
        `recalculation: ${tournament.slug} under ${rules.name} took ${String(ms)} ms`,
      );
    }
  }
  return { recalculations, notices };
}

/** recalculateLoadedTimed's recalculations, without their timings. */
export async function recalculateLoaded(
  db: Db,
  tournaments: readonly Tournament[],
): Promise<Recalculation[]> {
  return (await recalculateLoadedTimed(db, tournaments)).recalculations;
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
