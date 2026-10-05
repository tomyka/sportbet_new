import {
  emailInvariant,
  fillInCountInvariant,
  personNameInvariant,
  usernameInvariant,
} from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { tournaments } from '../tournament/schema';

/**
 * A player: the id and username scoring names them by, and the account
 * (spec 4b) - the address sign-in matches exactly (EmailIdentity, #41),
 * and the name and surname the rail shows. Google ids wait for 4c.
 */
export const players = pgTable(
  'players',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    // Unique by exact text (P12: none duplicated in production).
    username: text('username').notNull().unique('players_username_unique'),
    /** Trimmed and lower case (normalizeEmail), on every write. */
    email: text('email').notNull(),
    name: text('name').notNull(),
    surname: text('surname').notNull(),
  },
  (table) => [
    // sportbet's users_email_unique under utf8mb4_unicode_ci refuses a
    // second spelling once accents are ignored; so does this. Never a
    // lookup key: sign-in uses players_email_idx, exactly.
    uniqueIndex('players_email_folded_unique').on(
      sql`email_fold(${table.email})`,
    ),
    index('players_email_idx').on(table.email),
    ...playerInvariantChecks.map(invariantCheck),
  ],
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
    // loadPlayerStatuses reads every tournament of the tournament's players.
    index('tournament_players_player_idx').on(table.playerId),
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
  {
    constraint: 'players_email_format',
    column: players.email,
    invariant: emailInvariant,
  },
  {
    constraint: 'players_name_length',
    column: players.name,
    invariant: personNameInvariant,
  },
  {
    constraint: 'players_surname_length',
    column: players.surname,
    invariant: personNameInvariant,
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
