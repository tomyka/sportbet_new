import { PREDICTION_ORIGINS, scoreSideInvariant } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { players } from '../player/schema';
import { games } from '../season/schema';

/** Built from the domain's list, so the enum and the type cannot drift. */
export const predictionOriginEnum = pgEnum(
  'prediction_origin',
  PREDICTION_ORIGINS,
);

/**
 * One row per player and game (audit issue 15, built in). The stored shape
 * of MatchPrediction.stored: a half-typed row and a blank one are kept.
 */
export const matchPredictions = pgTable(
  'match_predictions',
  {
    playerId: integer('player_id').notNull(),
    gameId: integer('game_id').notNull(),
    home: smallint('home'),
    away: smallint('away'),
    origin: predictionOriginEnum('origin').notNull(),
    /** Null for every sportbet row: it keeps no fill-in time (FI-4). */
    filledInAt: timestamp('filled_in_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    primaryKey({
      name: 'match_predictions_pk',
      columns: [table.playerId, table.gameId],
    }),
    foreignKey({
      name: 'match_predictions_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'match_predictions_game_fk',
      columns: [table.gameId],
      foreignColumns: [games.id],
    }).onDelete('restrict'),
    // A tournament's predictions are read through its games.
    index('match_predictions_game_idx').on(table.gameId),
    // MatchPrediction.stored: level.
    check(
      'match_predictions_not_level',
      sql`${table.home} is null or ${table.away} is null or ${table.home} <> ${table.away}`,
    ),
    // MatchPrediction.stored: fill-in-without-score.
    check(
      'match_predictions_fill_in_scored',
      sql`${table.origin} = 'real' or (${table.home} is not null and ${table.away} is not null)`,
    ),
    // MatchPrediction.stored: real-with-fill-in-time.
    check(
      'match_predictions_fill_in_time',
      sql`${table.origin} <> 'real' or ${table.filledInAt} is null`,
    ),
    ...predictionInvariantChecks.map(invariantCheck),
  ],
);

/** Every invariant CHECK on `match_predictions`. */
export const predictionInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'match_predictions_home_not_negative',
    column: matchPredictions.home,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'match_predictions_away_not_negative',
    column: matchPredictions.away,
    invariant: scoreSideInvariant,
  },
];

/**
 * Each saved score (sportbet's audit_prediction_games, written by
 * AuditPredictionGameController only when both scores are saved): the
 * pair, and the row as it was. Erased with the account (R-25); not copied
 * from production, so it starts empty at switch-over (R-60). No IP is
 * kept (R-45).
 */
export const auditPredictionGames = pgTable(
  'audit_prediction_games',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    playerId: integer('player_id').notNull(),
    gameId: integer('game_id').notNull(),
    home: smallint('home').notNull(),
    away: smallint('away').notNull(),
    oldHome: smallint('old_home'),
    oldAway: smallint('old_away'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'audit_prediction_games_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'audit_prediction_games_game_fk',
      columns: [table.gameId],
      foreignColumns: [games.id],
    }).onDelete('restrict'),
    index('audit_prediction_games_player_idx').on(table.playerId),
    index('audit_prediction_games_game_idx').on(table.gameId),
    ...auditPredictionInvariantChecks.map(invariantCheck),
  ],
);

/** Every invariant CHECK on `audit_prediction_games`: each side a score. */
export const auditPredictionInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'audit_prediction_games_home_not_negative',
    column: auditPredictionGames.home,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'audit_prediction_games_away_not_negative',
    column: auditPredictionGames.away,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'audit_prediction_games_old_home_not_negative',
    column: auditPredictionGames.oldHome,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'audit_prediction_games_old_away_not_negative',
    column: auditPredictionGames.oldAway,
    invariant: scoreSideInvariant,
  },
];
