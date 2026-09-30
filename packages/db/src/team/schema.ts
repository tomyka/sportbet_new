import {
  outcomePlaceInvariant,
  storedFinalPlaceInvariant,
} from '@sportbet/domain';
import {
  boolean,
  foreignKey,
  integer,
  pgTable,
  smallint,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { tournaments } from '../tournament/schema';

export const teams = pgTable(
  'teams',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer('tournament_id').notNull(),
    /** sportbet's `teams.team`, also the logo's file name. */
    name: text('name').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'teams_tournament_fk',
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete('restrict'),
    // The target of the composite foreign keys that keep a game's teams,
    // and a survival pick's team, in their round's tournament.
    unique('teams_tournament_id_id_unique').on(table.tournamentId, table.id),
  ],
);

/** A team's outcome (TeamOutcomes), one row per team. */
export const teamOutcomes = pgTable(
  'team_outcomes',
  {
    teamId: integer('team_id').primaryKey(),
    /** Null until the table is entered; sportbet's 0 maps to null. */
    place: smallint('place'),
    playOffs: boolean('play_offs').notNull(),
    finalFour: boolean('final_four').notNull(),
    finalPlace: smallint('final_place'),
  },
  (table) => [
    foreignKey({
      name: 'team_outcomes_team_fk',
      columns: [table.teamId],
      foreignColumns: [teams.id],
    }).onDelete('restrict'),
    ...teamInvariantChecks.map(invariantCheck),
  ],
);

/** Every CHECK on `team_outcomes`: each holds a domain invariant. */
export const teamInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'team_outcomes_place_positive',
    column: teamOutcomes.place,
    invariant: outcomePlaceInvariant,
  },
  {
    constraint: 'team_outcomes_final_place_range',
    column: teamOutcomes.finalPlace,
    invariant: storedFinalPlaceInvariant,
  },
];
