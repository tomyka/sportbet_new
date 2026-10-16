import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { jobLeases } from './schema';

/** A job's lease held by one run: `releaseJobLease` frees it by `runId`. */
export interface JobLease {
  readonly job: string;
  readonly runId: string;
}

const taken = z.array(z.object({ runId: z.uuid() }));

/**
 * Takes a job's lease for `minutes` (R-97, as sportbet's
 * `withoutOverlapping(30)`), or null while another run holds it: one
 * upsert that succeeds only when the old lease has expired, so a crashed
 * run frees the job when its time is up. A row, not an advisory lock: the
 * app reaches Postgres through a transaction-mode pooler, where a session
 * lock is not held.
 */
export async function takeJobLease(
  db: Executor,
  job: string,
  minutes: number,
): Promise<JobLease | null> {
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new Error(`takeJobLease: ${String(minutes)} minutes is no lease`);
  }
  const runId = crypto.randomUUID();
  const heldUntil = sql`now() + make_interval(mins => ${minutes})`;
  const rows = taken.parse(
    await db
      .insert(jobLeases)
      .values({ job, heldUntil, runId })
      .onConflictDoUpdate({
        target: jobLeases.job,
        set: { heldUntil, runId },
        setWhere: sql`${jobLeases.heldUntil} < now()`,
      })
      .returning({ runId: jobLeases.runId }),
  );
  return rows.length === 0 ? null : { job, runId };
}

/**
 * Frees the job at once. A lease another run has taken since (this one's
 * time ran out) is not touched: the release is by `runId`.
 */
export async function releaseJobLease(
  db: Executor,
  lease: JobLease,
): Promise<void> {
  await db
    .delete(jobLeases)
    .where(and(eq(jobLeases.job, lease.job), eq(jobLeases.runId, lease.runId)));
}
