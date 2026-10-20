import {
  PREDICTION_ORIGINS,
  type MatchPrediction,
  type PlayerId,
  type PointsRows,
  type RuleSet,
  type Tournament,
  type TournamentTotal,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { gameOf, keyOf, playerOf } from '../edge';
import { loadRoster, type RosterScope } from '../league/roster';
import { loadUsernames } from '../player/repository';
import { loadTournamentTotals } from '../points/totals';
import { matchPoints } from '../points/schema';
import { matchPredictions } from '../prediction/schema';
import { games } from '../season/schema';

/** A scored prediction's origin: all a standing reads of predictions. */
export type ScoredOrigin = Pick<MatchPrediction, 'player' | 'game' | 'origin'>;

/**
 * One tournament as every table of its players reads it, under one rule
 * set: the league table, the game page, the leaderboard and the hub's
 * guest panels.
 */
export interface TournamentStanding {
  readonly tournament: Tournament;
  /** The rule set's stored rows, of its own source. */
  readonly rows: PointsRows;
  /**
   * Who counts: the players of the scope it was loaded for (loadRoster,
   * R-73) - the tournament's listed players, or a league's roster.
   */
  readonly listed: ReadonlySet<PlayerId>;
  /**
   * Each player's total (loadTournamentTotals): the listed players first,
   * one without a row at zero, then anyone else with a row.
   */
  readonly totals: readonly TournamentTotal[];
  /** The username of every listed player and everyone with a row. */
  readonly usernames: ReadonlyMap<PlayerId, string>;
}

const originRows = z.array(
  z.object({
    player: z.int(),
    game: z.int(),
    origin: z.enum(PREDICTION_ORIGINS),
  }),
);

/**
 * Three columns of the predictions that have a match points row of the
 * source - one player's, or with null everyone's: what isFullyCorrect
 * judges (the leaderboard's "Nugalėtojai", the "serija" tile). Read only
 * where it is judged, never with the standing every table loads.
 */
export async function loadScoredOrigins(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
  player: PlayerId | null = null,
): Promise<ScoredOrigin[]> {
  const rows = await db
    .select({
      player: matchPredictions.playerId,
      game: matchPredictions.gameId,
      origin: matchPredictions.origin,
    })
    .from(matchPredictions)
    .innerJoin(games, eq(games.id, matchPredictions.gameId))
    .innerJoin(
      matchPoints,
      and(
        eq(matchPoints.playerId, matchPredictions.playerId),
        eq(matchPoints.gameId, matchPredictions.gameId),
        eq(matchPoints.source, rules.name),
      ),
    )
    .where(
      and(
        eq(games.tournamentId, tournament.id),
        player === null
          ? undefined
          : eq(matchPredictions.playerId, keyOf(player, 'player')),
      ),
    );
  return originRows.parse(rows).map(({ player, game, origin }) => ({
    player: playerOf(player),
    game: gameOf(game),
    origin,
  }));
}

/**
 * The tournament's standing under the rule set: its rows of the rule set's
 * own source, the players of the scope (loadRoster), their totals and the usernames. It
 * reads no prediction (loadScoredOrigins does, where one is judged). It
 * only loads; the domain decides each table from it.
 */
export async function loadTournamentStanding(
  db: Executor,
  tournament: Tournament,
  scope: RosterScope,
  rules: RuleSet,
): Promise<TournamentStanding> {
  const listed = await loadRoster(db, tournament, scope);
  const { rows, totals } = await loadTournamentTotals(db, tournament, rules, [
    ...listed,
  ]);
  return {
    tournament,
    rows,
    listed,
    totals,
    usernames: await loadUsernames(
      db,
      totals.map(({ player }) => player),
    ),
  };
}
