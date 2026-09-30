import { fillInCountInvariant, usernameInvariant } from '@sportbet/domain';
import {
  boolean,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { tournaments } from '../tournament/schema';

/**
 * A player: the id and the username, and nothing else in 2.2 - no name,
 * surname, email, Google id, locale, reminder setting or admin level.
 */
export const players = pgTable(
  'players',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    // Unique by exact text (P12: none duplicated in production); the case-
    // and accent-insensitive rule sign-in needs is the auth slice's.
    username: text('username').notNull().unique('players_username_unique'),
  },
  () => playerInvariantChecks.map(invariantCheck),
);

/** Who plays a tournament, and the status scoring needs there (R-7, R-19). */
export const tournamentPlayers = pgTable(
  'tournament_players',
  {
    tournamentId: integer('tournament_id').notNull(),
    playerId: integer('player_id').notNull(),
    /** R-7's per-tournament switch; sportbet's one `user_settings.active`. */
    switchedOff: boolean('switched_off').notNull(),
    /** R-19; always false from sportbet, which cannot store a separate hide. */
    adminHidden: boolean('admin_hidden').notNull().default(false),
    /** The fill-ins counted toward switching off, in this tournament. */
    fillIns: integer('fill_ins').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'tournament_players_pk',
      columns: [table.tournamentId, table.playerId],
    }),
    foreignKey({
      name: 'tournament_players_tournament_fk',
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'tournament_players_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    ...tournamentPlayerInvariantChecks.map(invariantCheck),
  ],
);

/** Every CHECK on `players`: each holds a domain invariant. */
export const playerInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'players_username_format',
    column: players.username,
    invariant: usernameInvariant,
  },
];

/** Every CHECK on `tournament_players`: each holds a domain invariant. */
export const tournamentPlayerInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'tournament_players_fill_ins_not_negative',
    column: tournamentPlayers.fillIns,
    invariant: fillInCountInvariant,
  },
];
