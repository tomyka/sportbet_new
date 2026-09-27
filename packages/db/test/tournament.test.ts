import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createDb,
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  type NewTournament,
} from '../src';
import { truncateAll } from '../src/testing';

const { db, close } = createDb(inject('databaseUrl'));

afterAll(close);
beforeEach(() => truncateAll(db));

const euro: NewTournament = {
  slug: 'euro-2028',
  name: 'Euro 2028',
  format: 'football',
};
const euroleague: NewTournament = {
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
};

const withoutId = ({ slug, name, format }: NewTournament) => ({
  slug,
  name,
  format,
});

describe('listTournaments', () => {
  it('returns nothing from an empty table', async () => {
    expect(await listTournaments(db)).toEqual([]);
  });

  it('returns every tournament, ordered by name', async () => {
    await insertTournaments(db, [euroleague, euro]);
    const listed = await listTournaments(db);
    expect(listed.map(withoutId)).toEqual([euro, euroleague]);
    expect(listed.every((t) => Number.isInteger(t.id) && t.id > 0)).toBe(true);
  });
});

describe('findTournamentBySlug', () => {
  it('finds a stored tournament', async () => {
    await insertTournaments(db, [euro, euroleague]);
    const found = await findTournamentBySlug(db, 'euroleague-2026-27');
    expect(found === undefined ? undefined : withoutId(found)).toEqual(
      euroleague,
    );
  });

  it('returns undefined for an unknown slug', async () => {
    await insertTournaments(db, [euro]);
    expect(await findTournamentBySlug(db, 'nope')).toBeUndefined();
  });
});

describe('insertTournaments', () => {
  it('keeps the existing row when a slug is inserted again', async () => {
    await insertTournaments(db, [euro]);
    await insertTournaments(db, [{ ...euro, name: 'Renamed' }]);
    expect((await listTournaments(db)).map(withoutId)).toEqual([euro]);
  });

  it('does nothing for an empty list', async () => {
    await insertTournaments(db, []);
    expect(await listTournaments(db)).toEqual([]);
  });
});
