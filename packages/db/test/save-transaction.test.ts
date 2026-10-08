import { ok, refuse, type Result } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Tx } from '../src/client';
import { decideUnderLock } from '../src/save-transaction';
import { useTestDatabase } from '../src/testing';
import { saveTournament } from '../src/tournament/repository';
import { OTHER, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const slugs = async () =>
  z
    .array(z.object({ slug: z.string() }))
    .parse(
      (await client.query('select slug from tournaments order by id')).rows,
    )
    .map(({ slug }) => slug);

/** A load that writes as it loads (as seeding does), then gives `loaded`. */
const writingLoad =
  <T>(loaded: T | null) =>
  async (tx: Tx): Promise<T | null> => {
    await saveTournament(tx, TOURNAMENT);
    return loaded;
  };

const writeOther = async (tx: Tx) => {
  await saveTournament(tx, OTHER);
};

describe('decideUnderLock', () => {
  it('save transaction: an accepted decision is written, with what the load wrote', async () => {
    const decided = await decideUnderLock(db, {
      load: writingLoad(7),
      unloaded: 'not-yours',
      decide: (loaded: number): Result<number, 'not-yours' | 'refused'> =>
        ok(loaded + 1),
      write: writeOther,
    });
    expect(decided).toEqual({ ok: true, value: 8 });
    expect(await slugs()).toEqual([TOURNAMENT.slug, OTHER.slug]);
  });

  it('save transaction: nothing loaded is the unloaded refusal, and what the load wrote is rolled back', async () => {
    const decided = await decideUnderLock(db, {
      load: writingLoad<number>(null),
      unloaded: 'not-yours',
      decide: (): Result<number, 'not-yours'> => ok(1),
      write: writeOther,
    });
    expect(decided).toEqual({ ok: false, refusal: 'not-yours' });
    expect(await slugs()).toEqual([]);
  });

  it('save transaction: a refused decision writes nothing, the load included', async () => {
    const decided = await decideUnderLock(db, {
      load: writingLoad(7),
      unloaded: 'not-yours',
      decide: (): Result<number, 'not-yours' | 'refused'> => refuse('refused'),
      write: writeOther,
    });
    expect(decided).toEqual({ ok: false, refusal: 'refused' });
    expect(await slugs()).toEqual([]);
  });

  it("save transaction: inside a caller's transaction a refusal rolls back only its own savepoint", async () => {
    await db.transaction(async (tx) => {
      await saveTournament(tx, OTHER);
      expect(
        await decideUnderLock(tx, {
          load: writingLoad(7),
          unloaded: 'not-yours',
          decide: (): Result<number, 'refused'> => refuse('refused'),
          write: writeOther,
        }),
      ).toEqual({ ok: false, refusal: 'refused' });
    });
    expect(await slugs()).toEqual([OTHER.slug]);
  });

  it('save transaction: any other failure is thrown, and nothing is written', async () => {
    await expect(
      decideUnderLock(db, {
        load: writingLoad(7),
        unloaded: 'not-yours',
        decide: (): Result<number, 'not-yours'> => {
          throw new Error('boom');
        },
        write: writeOther,
      }),
    ).rejects.toThrow('boom');
    expect(await slugs()).toEqual([]);
  });

  it('save transaction: the load runs with a 5 s lock timeout', async () => {
    const decided = await decideUnderLock(db, {
      load: async (tx) =>
        z
          .array(z.object({ lock_timeout: z.string() }))
          .parse((await tx.execute(sql`show lock_timeout`)).rows)[0]
          ?.lock_timeout ?? null,
      unloaded: 'not-yours',
      decide: (timeout): Result<string, 'not-yours'> => ok(timeout),
      write: () => Promise.resolve(),
    });
    expect(decided).toEqual({ ok: true, value: '5s' });
  });
});
