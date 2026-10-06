import {
  FORMATS,
  TOURNAMENT_STATUSES,
  roundNumberInvariant,
  slugInvariant,
  tournamentNameInvariant,
} from '@sportbet/domain';
import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';

/** Built from the domain's union, so the enum and the type cannot drift. */
export const formatEnum = pgEnum('format', FORMATS);

/** sportbet's `status` enum, built from the domain's list (TOURNAMENT_STATUSES). */
export const tournamentStatusEnum = pgEnum(
  'tournament_status',
  TOURNAMENT_STATUSES,
);

export const tournaments = pgTable(
  'tournaments',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    format: formatEnum('format').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * sportbet's `end_date`: on for the whole of it, UTC (R-21). Null until
     * an admin sets it, as sportbet allows (the owner, 2026-09-30).
     */
    endsOn: date('ends_on', { mode: 'string' }),
    /** Null is the format's own deadline round (ST-2). */
    standingsDeadlineRound: smallint('standings_deadline_round'),
    /** sportbet's `survival_game`. */
    survival: boolean('survival').notNull(),
    /** `TeamOutcomes.tableIsFinal` (R-14); sportbet does not record it. */
    standingsTableFinal: boolean('standings_table_final')
      .notNull()
      .default(false),
    /**
     * The hub's columns (slice 5; TournamentProfile), sportbet's own, with
     * its defaults: copied from production, not yet edited by any admin
     * screen. `sport` defaults to basketball (decision 11).
     */
    status: tournamentStatusEnum('status').notNull().default('upcoming'),
    startsOn: date('starts_on', { mode: 'string' }),
    sport: text('sport').notNull().default('basketball'),
    description: text('description'),
    isPublic: boolean('is_public').notNull().default(true),
  },
  // Drizzle calls this only when it reads the table's config, after the
  // list below exists.
  () => tournamentInvariantChecks.map(invariantCheck),
);

/** Every CHECK on `tournaments`: each holds a domain invariant. */
export const tournamentInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'tournaments_slug_format',
    column: tournaments.slug,
    invariant: slugInvariant,
  },
  {
    constraint: 'tournaments_name_not_blank',
    column: tournaments.name,
    invariant: tournamentNameInvariant,
    // The one place the two regex dialects are proven to draw the
    // blank-name line on exactly the same code points.
    sweep: 'every BMP character',
  },
  {
    constraint: 'tournaments_deadline_round_positive',
    column: tournaments.standingsDeadlineRound,
    invariant: roundNumberInvariant,
  },
];
