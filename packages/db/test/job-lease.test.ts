// takeJobLease / releaseJobLease (R-97): the database lease that stops two
// reminder runs overlapping.

import { describe, expect, it } from 'vitest';
import { releaseJobLease, takeJobLease } from '../src';
import { useTestDatabase } from '../src/testing';
import { rowsOf } from './world';

const { db, client } = useTestDatabase();

const leaseRows = async () =>
  rowsOf(await client.query('select job, run_id from job_leases'));

describe('takeJobLease', () => {
  it('gives the first taker a lease and the second nothing while it is held', async () => {
    const first = await takeJobLease(db, 'reminders', 30);
    expect(first).not.toBeNull();
    expect(await takeJobLease(db, 'reminders', 30)).toBeNull();
    expect(await leaseRows()).toEqual([
      { job: 'reminders', run_id: first?.runId },
    ]);
  });

  it('holds the lease for the minutes asked', async () => {
    await takeJobLease(db, 'reminders', 30);
    const { rows } = await client.query<{ minutes: number }>(
      "select round(extract(epoch from held_until - now()) / 60)::int as minutes from job_leases where job = 'reminders'",
    );
    expect(rows).toEqual([{ minutes: 30 }]);
  });

  it('is free after the holder releases it', async () => {
    const first = await takeJobLease(db, 'reminders', 30);
    if (first === null) throw new Error('the first lease was refused');
    await releaseJobLease(db, first);
    expect(await leaseRows()).toEqual([]);
    expect(await takeJobLease(db, 'reminders', 30)).not.toBeNull();
  });

  it('is free after held_until passes: a crashed run frees the job', async () => {
    await client.query(
      "insert into job_leases (job, held_until, run_id) values ('reminders', now() - interval '1 second', gen_random_uuid())",
    );
    const second = await takeJobLease(db, 'reminders', 30);
    expect(second).not.toBeNull();
    expect(await leaseRows()).toEqual([
      { job: 'reminders', run_id: second?.runId },
    ]);
  });

  it('leases each job apart', async () => {
    expect(await takeJobLease(db, 'reminders', 30)).not.toBeNull();
    expect(await takeJobLease(db, 'another-job', 30)).not.toBeNull();
  });

  it('lets one of two simultaneous takers through', async () => {
    const takers = await Promise.all([
      takeJobLease(db, 'reminders', 30),
      takeJobLease(db, 'reminders', 30),
      takeJobLease(db, 'reminders', 30),
    ]);
    expect(takers.filter((lease) => lease !== null)).toHaveLength(1);
  });

  it('refuses a lease of no minutes', async () => {
    await expect(takeJobLease(db, 'reminders', 0)).rejects.toThrow('no lease');
    await expect(takeJobLease(db, 'reminders', 1.5)).rejects.toThrow(
      'no lease',
    );
  });
});

describe('releaseJobLease', () => {
  it('does nothing for a stale run id: the lease a later run holds stays', async () => {
    const stale = await takeJobLease(db, 'reminders', 30);
    if (stale === null) throw new Error('the first lease was refused');
    await client.query(
      "update job_leases set held_until = now() - interval '1 second' where job = 'reminders'",
    );
    const current = await takeJobLease(db, 'reminders', 30);
    await releaseJobLease(db, stale);
    expect(await leaseRows()).toEqual([
      { job: 'reminders', run_id: current?.runId },
    ]);
  });
});
