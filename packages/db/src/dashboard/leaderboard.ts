import {
  leaderboardRows,
  PREDICTION_ORIGINS,
  type LeaderboardRow,
  type LeaderboardTournament,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { and, eq, exists, not, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Executor } from '../client';
import { gameOf, playerOf } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { matchPoints } from '../points/schema';
import { games } from '../season/schema';
import { tournaments } from '../tournament/schema';
import { loadUsernames } from '../hub/repository';
import { loadTournamentPoints } from '../points/repository';
import { matchPredictions } from '../prediction/schema';
import { loadTournamentCatalogue } from '../tournament/catalogue';
import { loadListed } from './league-table';

const originRows = z.array(
  z.object({
    player: z.int(),
    game: z.int(),
    origin: z.enum(PREDICTION_ORIGINS),
  }),
);

/**
 * The origin of each prediction of the tournament that has a match points
 * row of the rule set's source: all the leaderboard reads of predictions
 * (isFullyCorrect, "Nugalėtojai"), three columns of the scored rows only.
 */
async function loadScoredOrigins(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<LeaderboardTournament['predictions']> {
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
    .where(eq(games.tournamentId, tournament.id));
  return originRows.parse(rows).map(({ player, game, origin }) => ({
    player: playerOf(player),
    game: gameOf(game),
    origin,
  }));
}

/**
 * MainController::leaderboard: every tournament's stored rows of the rule
 * set's own source (loadTournamentPoints), its listed players
 * (listedPlayers), its scored predictions' origins and whether it is
 * public, then the usernames of everyone with a row, handed to
 * leaderboardRows, which decides who counts (R-77, R-77 amended) and
 * ranks (R-18).
 */
export async function loadLeaderboard(
  db: Executor,
  rules: RuleSet,
): Promise<readonly LeaderboardRow[]> {
  const tournaments: LeaderboardTournament[] = [];
  for (const { tournament, profile } of await loadTournamentCatalogue(db)) {
    tournaments.push({
      rows: await loadTournamentPoints(db, tournament, rules.name),
      listed: await loadListed(db, tournament, rules),
      predictions: await loadScoredOrigins(db, tournament, rules),
      isPublic: profile.isPublic,
    });
  }
  const scored = new Set(
    tournaments.flatMap(({ rows }) => rows.matches.map(({ player }) => player)),
  );
  return leaderboardRows({
    tournaments,
    usernames: await loadUsernames(db, [...scored]),
    rules,
  });
}

const oneRows = z.array(z.object({ one: z.literal(1) }));

/**
 * PlayerTotals::anyRecorded: is there a leaderboard to offer at all
 * ("Lyderiai" in the guest navigation)? One query (a row or none, LIMIT 1) asking what
 * leaderboardRows decides, so the navigation never offers an empty board
 * (sportbet issue 131): a match points row of the rule set's own source,
 * in a public tournament under R-77 amended, of a player listed there
 * (RA-4: not switched off - in that tournament under R-7, anywhere under
 * sportbet's one switch - and not hidden by an admin). Under sportbet's
 * one switch (R-77's sportbet side) a player unlisted anywhere is off the
 * board altogether; with one account-wide switch that is the same player
 * as one unlisted in this tournament. The db tests hold it equal to
 * loadLeaderboard's being non-empty under both sets.
 */
export async function anyLeaderboardEntry(
  db: Executor,
  rules: RuleSet,
): Promise<boolean> {
  const anywhere = alias(tournamentPlayers, 'anywhere');
  const switchedOff: SQL =
    rules.switchOff.countedPer === 'tournament'
      ? sql`${tournamentPlayers.switchedOff}`
      : exists(
          db
            .select({ one: sql`1` })
            .from(anywhere)
            .where(
              and(
                eq(anywhere.playerId, tournamentPlayers.playerId),
                eq(anywhere.switchedOff, true),
              ),
            ),
        );
  const conditions: SQL[] = [
    eq(matchPoints.source, rules.name),
    not(switchedOff),
    eq(tournamentPlayers.adminHidden, false),
  ];
  if (rules.leaderboardPublicTournamentsOnly) {
    conditions.push(eq(tournaments.isPublic, true));
  }
  const rows = await db
    .select({ one: sql<number>`1`.mapWith(Number) })
    .from(matchPoints)
    .innerJoin(games, eq(games.id, matchPoints.gameId))
    .innerJoin(tournaments, eq(tournaments.id, games.tournamentId))
    .innerJoin(
      tournamentPlayers,
      and(
        eq(tournamentPlayers.tournamentId, games.tournamentId),
        eq(tournamentPlayers.playerId, matchPoints.playerId),
      ),
    )
    .where(and(...conditions))
    .limit(1);
  return oneRows.parse(rows).length > 0;
}
