import {
  adminLevelInvariant,
  AUDIT_LOGIN_METHODS,
  emailInvariant,
  localeInvariant,
  LOGIN_CODE_PURPOSES,
} from '@sportbet/domain';
import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { players } from '../player/schema';
import { tournaments } from '../tournament/schema';

/** Built from the domain's lists, so the enums and the types cannot drift. */
export const loginCodePurposeEnum = pgEnum(
  'login_code_purpose',
  LOGIN_CODE_PURPOSES,
);
export const auditLoginMethodEnum = pgEnum(
  'audit_login_method',
  AUDIT_LOGIN_METHODS,
);

const moment = (name: string) => timestamp(name, { withTimezone: true });

/**
 * A player's settings: sportbet's `user_settings` columns 4b reads, and
 * R-28's last-used tournament, stored with the player rather than in the
 * session (decision 5). Every account has one row.
 */
export const playerSettings = pgTable(
  'player_settings',
  {
    playerId: integer('player_id').primaryKey(),
    /** Carried, unused: the app is Lithuanian only (decision 13). */
    locale: text('locale').notNull().default('lt'),
    /** sportbet's `admin`, as it is; R-26's tiers are mapped by slices 13 and 14. */
    adminLevel: smallint('admin_level').notNull().default(0),
    lastTournamentId: integer('last_tournament_id'),
  },
  (table) => [
    foreignKey({
      name: 'player_settings_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'player_settings_last_tournament_fk',
      columns: [table.lastTournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete('set null'),
    ...playerSettingsInvariantChecks.map(invariantCheck),
  ],
);

/**
 * One-time codes (sportbet's login_codes): stored only as a hash, scoped
 * by purpose (#43), live until consumed or expired. Keyed by the address,
 * not the player: registration's codes (4c) are mailed before any account
 * exists.
 */
export const loginCodes = pgTable(
  'login_codes',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    email: text('email').notNull(),
    purpose: loginCodePurposeEnum('purpose').notNull(),
    codeHash: text('code_hash').notNull(),
    createdAt: moment('created_at').notNull(),
    expiresAt: moment('expires_at').notNull(),
    consumedAt: moment('consumed_at'),
  },
  (table) => [
    index('login_codes_email_purpose_idx').on(table.email, table.purpose),
    ...loginCodeInvariantChecks.map(invariantCheck),
  ],
);

/**
 * A signed-in browser (R-44): the cookie's random token is stored only as
 * its SHA-256, and the session lasts 90 days from its last visit.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tokenHash: text('token_hash')
      .notNull()
      .unique('sessions_token_hash_unique'),
    playerId: integer('player_id').notNull(),
    createdAt: moment('created_at').notNull(),
    lastSeenAt: moment('last_seen_at').notNull(),
    expiresAt: moment('expires_at').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'sessions_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    index('sessions_player_idx').on(table.playerId),
  ],
);

/**
 * The sign-in throttles' fixed windows (sportbet's cache-backed
 * RateLimiter; Vercel has no shared memory): a hashed key, when its
 * window began, and how many attempts it has counted.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    windowStartedAt: moment('window_started_at').notNull(),
    hits: integer('hits').notNull(),
  },
  (table) => [index('rate_limits_window_idx').on(table.windowStartedAt)],
);

/** Each sign-in (sportbet's audit_logins), erased with the account (R-25). */
export const auditLogins = pgTable(
  'audit_logins',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    playerId: integer('player_id').notNull(),
    method: auditLoginMethodEnum('method').notNull(),
    at: moment('at').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'audit_logins_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    index('audit_logins_player_idx').on(table.playerId),
  ],
);

/** Every CHECK on `player_settings`: each holds a domain invariant. */
export const playerSettingsInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'player_settings_locale_format',
    column: playerSettings.locale,
    invariant: localeInvariant,
  },
  {
    constraint: 'player_settings_admin_level_range',
    column: playerSettings.adminLevel,
    invariant: adminLevelInvariant,
  },
];

/** Every CHECK on `login_codes`: each holds a domain invariant. */
export const loginCodeInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'login_codes_email_format',
    column: loginCodes.email,
    invariant: emailInvariant,
  },
];
