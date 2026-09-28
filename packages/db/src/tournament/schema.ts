import {
  FORMATS,
  slugInvariant,
  tournamentNameInvariant,
} from '@sportbet/domain';
import { integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { invariantCheck } from '../invariant';

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
    invariantCheck('tournaments_slug_format', t.slug, slugInvariant),
    invariantCheck(
      'tournaments_name_not_blank',
      t.name,
      tournamentNameInvariant,
    ),
  ],
);
