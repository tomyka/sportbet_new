import {
  predictedPlaceInvariant,
  storedFinalPlaceInvariant,
} from '@sportbet/domain';
import {
  boolean,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  smallint,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { players } from '../player/schema';
import { teams } from '../team/schema';

/**
 * One player's standings row for one team. Null is a column never saved,
 * false a tick saved unticked (sportbet's 0/1/NULL).
 */
export const standingsPredictions = pgTable(
  'standings_predictions',
  {
    playerId: integer('player_id').notNull(),
    teamId: integer('team_id').notNull(),
    /** StandingsPrediction.stored keeps sportbet's place 0. */
    place: smallint('place'),
    playOffs: boolean('play_offs'),
    finalFour: boolean('final_four'),
    /** sportbet's 0 maps to null. */
    finalPlace: smallint('final_place'),
  },
  (table) => [
    primaryKey({
      name: 'standings_predictions_pk',
      columns: [table.playerId, table.teamId],
    }),
    foreignKey({
      name: 'standings_predictions_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'standings_predictions_team_fk',
      columns: [table.teamId],
      foreignColumns: [teams.id],
    }).onDelete('restrict'),
    ...standingsInvariantChecks.map(invariantCheck),
  ],
);

/** Every CHECK on `standings_predictions`: each holds a domain invariant. */
export const standingsInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'standings_predictions_place_not_negative',
    column: standingsPredictions.place,
    invariant: predictedPlaceInvariant,
  },
  {
    constraint: 'standings_predictions_final_place_range',
    column: standingsPredictions.finalPlace,
    invariant: storedFinalPlaceInvariant,
  },
];
