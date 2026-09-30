import {
  newTournamentSchema,
  roundNumber,
  type Tournament,
} from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  type NewTournament,
} from '../src';
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
