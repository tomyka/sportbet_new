import {
  FORMATS,
  NAME_NOT_BLANK_PATTERN,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
} from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/** Built from the domain's union, so the enum and the type cannot drift. */
export const formatEnum = pgEnum('format', FORMATS);

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
  },
  (t) => [
    check(
      'tournaments_slug_format',
      sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)} and char_length(${t.slug}) <= ${sql.raw(String(SLUG_MAX_LENGTH))}`,
    ),
    // The same character class the domain schema uses, so the database and
    // tournamentSchema agree on exactly which names are blank.
    check(
      'tournaments_name_not_blank',
      sql`${t.name} ~ ${sql.raw(`'${NAME_NOT_BLANK_PATTERN}'`)}`,
    ),
  ],
);
