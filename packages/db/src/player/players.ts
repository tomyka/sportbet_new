import {
  emailInvariant,
  personNameInvariant,
  usernameInvariant,
} from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';

/**
 * A player: the id and username scoring names them by, and the account
 * (spec 4b) - the address sign-in matches exactly (EmailIdentity, #41),
 * and the name and surname the rail shows. Google ids wait for 4c.
 *
 * Beside `tournamentPlayers` (schema.ts), not in it: the league tables
 * point at players, and `tournament_players` points at the leagues, so the
 * two cannot share a file without an import cycle.
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
    /**
     * The address an account asked to move to (R-24), parked once the code
     * is mailed to it; written only by `requestEmailChange`,
     * `confirmEmailChange` and `cancelEmailChange`. Not unique, as in
     * sportbet; not read from production, whose waiting changes are dropped.
     */
    pendingEmail: text('pending_email'),
    /** "Narys nuo" (R-114): sportbet's `users.created_at`, or the moment of `createAccount`. */
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
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
    constraint: 'players_pending_email_format',
    column: players.pendingEmail,
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
