import type {
  Game,
  MatchPrediction,
  PlayerId,
  PointsRows,
  StandingsPrediction,
  SurvivalRun,
  TeamOutcomes,
  Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import {
  saveTournamentPlayers,
  type TournamentPlayer,
} from '../player/repository';
import { saveTournamentPoints } from '../points/repository';
import { saveMatchPredictions } from '../prediction/repository';
import { saveGames, saveRounds, type SavedRound } from '../season/repository';
import { saveStandingsPredictions } from '../standings/repository';
import { saveSurvivalPicks } from '../survival/repository';
import { saveTeamOutcomes, saveTeams, type TeamRow } from '../team/repository';
import { saveTournament } from './repository';

/**
 * One tournament's inputs, every table of it: what the reader maps from a
 * production copy and the golden db test builds from the golden scenario.
 * Its players are the tournament's (`tournament_players`); each must be a
 * saved player (`savePlayers`) already, as players belong to no one
 * tournament.
 */
export interface TournamentSnapshot {
  readonly tournament: Tournament;
  readonly teams: readonly TeamRow[];
  readonly rounds: readonly SavedRound[];
  readonly games: readonly Game[];
  readonly outcomes: TeamOutcomes;
  readonly players: readonly TournamentPlayer[];
  readonly predictions: readonly MatchPrediction[];
  readonly standings: readonly StandingsPrediction[];
  readonly runs: ReadonlyMap<PlayerId, SurvivalRun>;
  /** Production's own points rows, saved under the `production` source. */
  readonly production: PointsRows;
}

/**
 * Saves the snapshot in one transaction (a savepoint when `db` is already
 * one), in foreign-key order: the tournament, its teams and rounds, games
 * and team outcomes, its players, their predictions, standings rows and
 * survival picks, then production's points rows. Every row is checked
 * against the tournament's own rounds, teams, games and players as saved
 * so far (TournamentScope): a stray row throws, and nothing of the snapshot
 * is saved. Every save is an upsert or a replace, so saving the same
 * snapshot twice leaves the same rows. Ids are kept as given; the caller
 * moves the identity sequences past them (advanceIdentitySequences).
 */
export async function saveTournamentSnapshot(
  db: Executor,
  snapshot: TournamentSnapshot,
): Promise<void> {
  const { tournament } = snapshot;
  await db.transaction(async (tx) => {
    await saveTournament(tx, tournament);
    await saveTeams(tx, tournament, snapshot.teams);
    await saveRounds(tx, tournament, snapshot.rounds);
    await saveGames(tx, tournament, snapshot.games);
    await saveTeamOutcomes(tx, tournament, snapshot.outcomes);
    await saveTournamentPlayers(tx, tournament, snapshot.players);
    await saveMatchPredictions(tx, tournament, snapshot.predictions);
    await saveStandingsPredictions(tx, tournament, snapshot.standings);
    await saveSurvivalPicks(tx, tournament, snapshot.runs);
    await saveTournamentPoints(
      tx,
      tournament,
      'production',
      snapshot.production,
    );
  });
}
