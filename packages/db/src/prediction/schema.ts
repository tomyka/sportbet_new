import { PREDICTION_ORIGINS, scoreSideInvariant } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
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
