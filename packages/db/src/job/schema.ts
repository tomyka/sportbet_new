import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * One row per scheduled job that must not overlap itself (R-97): the lease
 * a run takes with one upsert and releases by its `run_id`. A crashed run's
 * lease expires at `held_until`. A row, not an advisory lock, because the
 * app reaches Postgres through a transaction-mode pooler.
 */
export const jobLeases = pgTable('job_leases', {
  job: text('job').primaryKey(),
  heldUntil: timestamp('held_until', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  runId: uuid('run_id').notNull(),
});
