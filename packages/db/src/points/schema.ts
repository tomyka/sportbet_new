import { oddsInvariant, RULE_SET_NAMES } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { players } from '../player/schema';
import { games, rounds } from '../season/schema';
import { teams } from '../team/schema';

/**
 * Whose points a row holds: production's own, as the reader read them (the
 * parity oracle, and an input: sportbet's full recalculation reads its
 * stored odds and refolds its stored survival rows), or what
 * recalculateTournament derives under one rule set. Built from the domain's
 * rule set names, so the enum and the type cannot drift.
 */
export const POINTS_SOURCES = ['production', ...RULE_SET_NAMES] as const;

export type PointsSource = (typeof POINTS_SOURCES)[number];

export const pointsSourceEnum = pgEnum('points_source', POINTS_SOURCES);

/** Hundredths, as Points, Odds and sportbet's DECIMAL(8,2). */
const hundredths = (name: string) => numeric(name, { precision: 8, scale: 2 });
/** Ten-thousandths, as StandingsPoints, StandingsOdds and R-31. */
const tenThousandths = (name: string) =>
  numeric(name, { precision: 10, scale: 4 });

/** `game_odds`: the odds each scored game was scored with. */
export const gameOdds = pgTable(
  'game_odds',
  {
    source: pointsSourceEnum('source').notNull(),
    gameId: integer('game_id').notNull(),
    home: hundredths('home').notNull(),
    away: hundredths('away').notNull(),
    draw: hundredths('draw').notNull(),
  },
  (table) => [
    primaryKey({ name: 'game_odds_pk', columns: [table.source, table.gameId] }),
    foreignKey({
      name: 'game_odds_game_fk',
      columns: [table.gameId],
      foreignColumns: [games.id],
    }).onDelete('restrict'),
    ...gameOddsInvariantChecks.map(invariantCheck),
  ],
);

/** `point_results`: one prediction's points and its serija bonus. */
export const matchPoints = pgTable(
  'match_points',
  {
    source: pointsSourceEnum('source').notNull(),
    playerId: integer('player_id').notNull(),
    gameId: integer('game_id').notNull(),
    winner: hundredths('winner').notNull(),
    margin: hundredths('margin').notNull(),
    bingo: hundredths('bingo').notNull(),
    /** Always 0 (MS-7, #215); kept so the checker can compare it. */
    oddsPoints: hundredths('odds_points').notNull(),
    full: hundredths('full').notNull(),
    /** The odds the row was scored with. */
    odds: hundredths('odds').notNull(),
    /** `streak_bonus` (SE-3). */
    serija: hundredths('serija').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'match_points_pk',
      columns: [table.source, table.playerId, table.gameId],
    }),
    foreignKey({
      name: 'match_points_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'match_points_game_fk',
      columns: [table.gameId],
      foreignColumns: [games.id],
    }).onDelete('restrict'),
    // A tournament's rows are read, replaced and counted through its games.
    index('match_points_game_idx').on(table.gameId),
    ...matchPointsInvariantChecks.map(invariantCheck),
  ],
);

/**
 * `point_standings`: one player's standings points for one team, a line
 * (points and odds) per stage; null is kept apart from 0 (ST-6).
 * sportbet's `last16_*` and `last32_*` are football's and not carried.
 */
export const standingsPoints = pgTable(
  'standings_points',
  {
    source: pointsSourceEnum('source').notNull(),
    playerId: integer('player_id').notNull(),
    teamId: integer('team_id').notNull(),
    placePoints: tenThousandths('place_points'),
    placeOdds: tenThousandths('place_odds'),
    playOffsPoints: tenThousandths('play_offs_points'),
    playOffsOdds: tenThousandths('play_offs_odds'),
    finalFourPoints: tenThousandths('final_four_points'),
    finalFourOdds: tenThousandths('final_four_odds'),
    finalPoints: tenThousandths('final_points'),
    finalOdds: tenThousandths('final_odds'),
  },
  (table) => [
    primaryKey({
      name: 'standings_points_pk',
      columns: [table.source, table.playerId, table.teamId],
    }),
    foreignKey({
      name: 'standings_points_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'standings_points_team_fk',
      columns: [table.teamId],
      foreignColumns: [teams.id],
    }).onDelete('restrict'),
    // A tournament's rows are read, replaced and counted through its teams.
    index('standings_points_team_idx').on(table.teamId),
    ...standingsPointsInvariantChecks.map(invariantCheck),
  ],
);

/**
 * `point_survivals`, and the domain's SurvivalPoints. Every row has its own
 * generated id. A production row also keeps sportbet's `point_survivals.id`
 * (`sportbet_id`, the domain's `StoredSurvivalRow.id` and a production
 * `SurvivalPoints.storedId`), which no derived row holds; a row a sportbet
 * refold derives names the production row it rewrites by that id
 * (`stored_row_id`). The two id spaces never meet, so no later load of
 * production's rows can land on a derived row.
 */
export const survivalPoints = pgTable(
  'survival_points',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    source: pointsSourceEnum('source').notNull(),
    playerId: integer('player_id').notNull(),
    tournamentId: integer('tournament_id').notNull(),
    roundId: integer('round_id').notNull(),
    teamId: integer('team_id').notNull(),
    /** Null only while a pick waits for its game (SU-8). */
    points: hundredths('points'),
    /** R-34. */
    provisional: boolean('provisional').notNull(),
    /** sportbet's `point_survivals.id`: set on a production row, only. */
    sportbetId: integer('sportbet_id'),
    /** The `sportbet_id` of the production row a derived row rewrites. */
    storedRowId: integer('stored_row_id'),
  },
  (table) => [
    foreignKey({
      name: 'survival_points_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'survival_points_round_fk',
      columns: [table.tournamentId, table.roundId],
      foreignColumns: [rounds.tournamentId, rounds.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'survival_points_team_fk',
      columns: [table.tournamentId, table.teamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
    // A rewrite names a production row (only one holds a sportbet_id) of
    // its own tournament; that row cannot be deleted, nor moved to another
    // tournament, while the rewrite stands.
    foreignKey({
      name: 'survival_points_stored_row_fk',
      columns: [table.tournamentId, table.storedRowId],
      foreignColumns: [table.tournamentId, table.sportbetId],
    }).onDelete('restrict'),
    // A tournament's rows are read and replaced by tournament and source,
    // and counted by tournament: the tournament leads. Also indexes
    // survival_points_round_fk.
    index('survival_points_tournament_source_idx').on(
      table.tournamentId,
      table.source,
    ),
    // What saveTournamentPoints upserts a production row on.
    unique('survival_points_sportbet_id_unique').on(table.sportbetId),
    // The target of the foreign key above.
    unique('survival_points_tournament_sportbet_id_unique').on(
      table.tournamentId,
      table.sportbetId,
    ),
    // The domain's refold may give two rows one player and round, so
    // production rows are unique by sportbet's id alone; a rewrite of a
    // stored row is unique per source and stored row, and a row scored
    // from the picks per source, player and round.
    uniqueIndex('survival_points_stored_row_unique')
      .on(table.source, table.storedRowId)
      .where(sql`${table.storedRowId} is not null`),
    uniqueIndex('survival_points_pick_unique')
      .on(table.source, table.playerId, table.roundId)
      .where(
        sql`${table.storedRowId} is null and ${table.source} <> 'production'`,
      ),
    // A production row is a stored total: scored and final.
    check(
      'survival_points_production_shape',
      sql`${table.source} <> 'production' or (${table.points} is not null and not ${table.provisional})`,
    ),
    // sportbet's id is a production row's, and every production row has one.
    check(
      'survival_points_sportbet_id',
      sql`(${table.source} = 'production') = (${table.sportbetId} is not null)`,
    ),
    // Only a derived row rewrites a production row; one never rewrites.
    check(
      'survival_points_rewrites_production',
      sql`${table.storedRowId} is null or ${table.source} <> 'production'`,
    ),
  ],
);

/** Every CHECK on `game_odds`: each holds a domain invariant. */
export const gameOddsInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'game_odds_home_not_negative',
    column: gameOdds.home,
    invariant: oddsInvariant,
  },
  {
    constraint: 'game_odds_away_not_negative',
    column: gameOdds.away,
    invariant: oddsInvariant,
  },
  {
    constraint: 'game_odds_draw_not_negative',
    column: gameOdds.draw,
    invariant: oddsInvariant,
  },
];

/** Every invariant CHECK on `match_points`: the points may be negative (MS-5). */
export const matchPointsInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'match_points_odds_not_negative',
    column: matchPoints.odds,
    invariant: oddsInvariant,
  },
];

/** Every CHECK on `standings_points`: each holds a domain invariant. */
export const standingsPointsInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'standings_points_place_odds_not_negative',
    column: standingsPoints.placeOdds,
    invariant: oddsInvariant,
  },
  {
    constraint: 'standings_points_play_offs_odds_not_negative',
    column: standingsPoints.playOffsOdds,
    invariant: oddsInvariant,
  },
  {
    constraint: 'standings_points_final_four_odds_not_negative',
    column: standingsPoints.finalFourOdds,
    invariant: oddsInvariant,
  },
  {
    constraint: 'standings_points_final_odds_not_negative',
    column: standingsPoints.finalOdds,
    invariant: oddsInvariant,
  },
];
