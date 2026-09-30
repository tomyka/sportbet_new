import {
  advanceIdentitySequences,
  countPointsRows,
  loadTournamentInputs,
  saveGames,
  saveMatchPredictions,
  savePlayers,
  saveRounds,
  saveStandingsPredictions,
  saveSurvivalPicks,
  saveTeamOutcomes,
  saveTeams,
  saveTournament,
  saveTournamentPlayers,
  saveTournamentPoints,
  type Db,
  type InputReads,
  type PointsSource,
  type PointsTable,
} from '@sportbet/db';
import {
  recalculateTournament,
  ruledRules,
  sportbetRules,
  type RecalculationRefusal,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import type { Mapped } from './map';

/**
 * Writes the mapped rows through the repositories in one transaction, in
 * foreign-key order, then moves every identity sequence past the loaded
 * ids. Every save is an upsert or a replace, so loading the same rows twice
 * leaves the same rows.
 */
export async function loadMapped(db: Db, mapped: Mapped): Promise<void> {
  await db.transaction(async (tx) => {
    await savePlayers(tx, mapped.players);
    for (const each of mapped.tournaments) {
      const { tournament } = each;
      await saveTournament(tx, tournament);
      await saveTeams(tx, tournament, each.teams);
      await saveRounds(tx, tournament, each.rounds);
      await saveGames(tx, tournament, each.games);
      await saveTeamOutcomes(tx, each.outcomes);
      await saveTournamentPlayers(tx, tournament, each.players);
      await saveMatchPredictions(tx, each.predictions);
      await saveStandingsPredictions(tx, each.standings);
      await saveSurvivalPicks(tx, tournament, each.runs);
      await saveTournamentPoints(tx, tournament, 'production', each.production);
    }
    await advanceIdentitySequences(tx);
  });
}

/** One recalculation the reader ran: refused, or saved under its rule set. */
export interface Recalculation {
  readonly tournament: number;
  readonly rules: RuleSet['name'];
  readonly refusal: RecalculationRefusal | null;
}

/**
 * What each rule set reads: parity under sportbetRules reads production's
 * stored odds (CO-7) and refolds its stored survival rows (SU-10); the
 * ruled set computes the odds from the votes and folds the picks.
 */
const RUNS: readonly (readonly [RuleSet, InputReads])[] = [
  [sportbetRules, { odds: 'stored', survival: 'stored-rows' }],
  [ruledRules, { odds: 'from-votes', survival: 'picks' }],
];

/**
 * recalculateTournament over each loaded tournament under both rule sets,
 * each result saved under its rule set's name. A refusal is reported, not
 * thrown.
 */
export async function recalculateLoaded(
  db: Db,
  tournaments: readonly Tournament[],
): Promise<Recalculation[]> {
  const done: Recalculation[] = [];
  for (const tournament of tournaments) {
    for (const [rules, reads] of RUNS) {
      const inputs = await loadTournamentInputs(db, tournament, reads);
      const result = recalculateTournament(inputs, rules);
      if (result.ok) {
        await saveTournamentPoints(db, tournament, rules.name, result.value);
      }
      done.push({
        tournament: tournament.id,
        rules: rules.name,
        refusal: result.ok ? null : result.refusal,
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
