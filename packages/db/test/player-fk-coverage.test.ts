// R-25, R-69, R-112, R-113 (slice 14): every foreign key to `players` is
// either handled by the database (cascade, set null) or deleted explicitly by
// deleteAccount. A table that gains a restricting key to players without
// being added to PLAYER_ROWS_DELETED fails here - sportbet issue 266's drift
// (a deletion that fails for every real player, or half-completes), closed
// structurally, as invariant-checks.test.ts does for CHECKs.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PLAYER_ROWS_DELETED } from '../src/account/deletion';
import { useTestDatabase } from '../src/testing';

const { client } = useTestDatabase();

const keyRows = z.array(
  z.object({
    table: z.string(),
    constraint: z.string(),
    rule: z.enum(['a', 'r', 'c', 'n', 'd']),
  }),
);

/** Every foreign key in the public schema that points at `players`, with what a delete does to it. */
async function keysToPlayers() {
  const rows = await client.query(
    `select con.conrelid::regclass::text as "table",
            con.conname as "constraint",
            con.confdeltype as rule
       from pg_constraint con
       join pg_namespace ns on ns.oid = con.connamespace
      where con.contype = 'f'
        and ns.nspname = 'public'
        and con.confrelid = 'public.players'::regclass
      order by con.conrelid::regclass::text, con.conname`,
  );
  return keyRows.parse(rows.rows);
}

const HANDLED_BY_THE_DATABASE = new Set(['c', 'n']);

describe('foreign keys to players', () => {
  it('there are some (the query finds the keys it should)', async () => {
    const keys = await keysToPlayers();
    expect(keys.length).toBeGreaterThanOrEqual(10);
    expect(keys.map(({ table }) => table)).toContain('match_predictions');
    expect(keys.map(({ table }) => table)).toContain('audit_admin_actions');
  });

  it('each cascades, sets null, or is a table deleteAccount deletes from first', async () => {
    const unhandled = (await keysToPlayers()).filter(
      ({ table, rule }) =>
        !HANDLED_BY_THE_DATABASE.has(rule) &&
        !PLAYER_ROWS_DELETED.includes(table),
    );
    expect(
      unhandled,
      'a foreign key to players that restricts and that deleteAccount does not delete first: add its table to PLAYER_ROWS_DELETED and delete from it, or make the key cascade or set null',
    ).toEqual([]);
  });

  it('every table deleteAccount deletes from still has a key to players (the list does not rot)', async () => {
    const tables = new Set((await keysToPlayers()).map(({ table }) => table));
    const stale = PLAYER_ROWS_DELETED.filter((table) => !tables.has(table));
    expect(stale).toEqual([]);
  });

  it('deleteAccount lists a table once, and only tables that need it', async () => {
    expect(new Set(PLAYER_ROWS_DELETED).size).toBe(PLAYER_ROWS_DELETED.length);
    const needing = (await keysToPlayers())
      .filter(({ rule }) => !HANDLED_BY_THE_DATABASE.has(rule))
      .map(({ table }) => table);
    expect([...PLAYER_ROWS_DELETED].sort()).toEqual(
      [...new Set(needing)].sort(),
    );
  });

  it('what a deleted account leaves is only what R-69 and R-117 keep: the rows that set null', async () => {
    const kept = (await keysToPlayers())
      .filter(({ rule }) => rule === 'n')
      .map(({ table }) => table);
    expect([...new Set(kept)].sort()).toEqual([
      'audit_admin_actions',
      'audit_results',
      'league_invites',
      'leagues',
    ]);
  });
});
