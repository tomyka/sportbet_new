import {
  newTournamentSchema,
  roundNumber,
  type Tournament,
} from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  advanceIdentitySequences,
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  saveTournament,
  type NewTournament,
} from '../src';
import { tournaments } from '../src/schema';
import { useTestDatabase } from '../src/testing';

const { db } = useTestDatabase();

const euroleagueA: NewTournament = {
  slug: 'euroleague-2025-26',
  name: 'Euroleague 2025/26',
  format: 'euroleague',
  endsOn: '2026-05-24',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};
const euroleagueB: NewTournament = {
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: unwrap(roundNumber(6)),
  survival: false,
  standingsTableFinal: true,
};

/** A listed tournament without its generated id. */
const withoutId = (tournament: Tournament): NewTournament =>
  newTournamentSchema.parse(tournament);

describe('listTournaments', () => {
  it('returns nothing from an empty table', async () => {
    expect(await listTournaments(db)).toEqual([]);
  });

  it('returns every tournament with every column, ordered by name', async () => {
    await insertTournaments(db, [euroleagueB, euroleagueA]);
    const listed = await listTournaments(db);
    expect(listed.map(withoutId)).toEqual([euroleagueA, euroleagueB]);
    expect(listed.every((t) => Number.isInteger(t.id) && t.id > 0)).toBe(true);
  });
});

describe('findTournamentBySlug', () => {
  it('finds a stored tournament', async () => {
    await insertTournaments(db, [euroleagueA, euroleagueB]);
    const found = await findTournamentBySlug(db, 'euroleague-2026-27');
    expect(found === undefined ? undefined : withoutId(found)).toEqual(
      euroleagueB,
    );
  });

  it('returns undefined for an unknown slug', async () => {
    await insertTournaments(db, [euroleagueA]);
    expect(await findTournamentBySlug(db, 'nope')).toBeUndefined();
  });
});

describe('insertTournaments', () => {
  it('keeps the existing row when a slug is inserted again', async () => {
    await insertTournaments(db, [euroleagueA]);
    await insertTournaments(db, [{ ...euroleagueA, name: 'Renamed' }]);
    expect((await listTournaments(db)).map(withoutId)).toEqual([euroleagueA]);
  });

  it('does nothing for an empty list', async () => {
    await insertTournaments(db, []);
    expect(await listTournaments(db)).toEqual([]);
  });
});

describe('saveTournament', () => {
  const saved: Tournament = { id: 7, ...euroleagueB };

  it('saves a tournament under its own id and reads it back unchanged', async () => {
    await saveTournament(db, saved);
    expect(await findTournamentBySlug(db, saved.slug)).toEqual(saved);
  });

  it('saves a tournament with no end date and reads it back with none (R-21)', async () => {
    const withoutEndDate: Tournament = { ...saved, endsOn: null };
    await saveTournament(db, withoutEndDate);
    expect(await findTournamentBySlug(db, saved.slug)).toEqual(withoutEndDate);
    expect(await listTournaments(db)).toEqual([withoutEndDate]);
  });

  it('clears the end date when saved again without one', async () => {
    await saveTournament(db, saved);
    await saveTournament(db, { ...saved, endsOn: null });
    expect((await findTournamentBySlug(db, saved.slug))?.endsOn).toBeNull();
  });

  it('updates the row with that id when saved again', async () => {
    await saveTournament(db, saved);
    await saveTournament(db, { ...saved, name: 'Euroleague 2026-27' });
    expect(await listTournaments(db)).toEqual([
      { ...saved, name: 'Euroleague 2026-27' },
    ]);
  });

  it('moves the id sequence past a saved id, so a generated id never collides', async () => {
    await saveTournament(db, saved);
    await advanceIdentitySequences(db);
    await insertTournaments(db, [euroleagueA]);
    const generated = await findTournamentBySlug(db, euroleagueA.slug);
    expect(generated?.id).toBe(8);
  });

  it('never moves the id sequence back, even after the highest rows are deleted', async () => {
    const later: Tournament = { ...saved, id: 9, slug: 'euroleague-2027-28' };
    await saveTournament(db, saved);
    await saveTournament(db, later);
    await advanceIdentitySequences(db);
    await db.delete(tournaments).where(eq(tournaments.id, later.id));
    await advanceIdentitySequences(db);
    await insertTournaments(db, [euroleagueA]);
    const generated = await findTournamentBySlug(db, euroleagueA.slug);
    expect(generated?.id).toBe(10);
  });

  it('runs inside a caller transaction, holding its locks until the caller commits', async () => {
    await saveTournament(db, saved);
    await db.transaction(async (tx) => {
      await advanceIdentitySequences(tx);
      const held = await tx.execute(
        sql`select count(*)::int as locks from pg_locks
            where relation = 'tournaments'::regclass and mode = 'ShareRowExclusiveLock'
              and pid = pg_backend_pid()`,
      );
      expect(held.rows).toEqual([{ locks: 1 }]);
    });
    await insertTournaments(db, [euroleagueA]);
    expect((await findTournamentBySlug(db, euroleagueA.slug))?.id).toBe(8);
  });
});
