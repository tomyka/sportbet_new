import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { emailAddress, type StoredPlayer } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findAccountByEmail,
  findTournamentById,
  listPlayerSettings,
  listPlayerTournaments,
  savePlayers,
  savePlayerSettings,
  setLastTournament,
} from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, OTHER, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();

const email = (typed: string) => unwrap(emailAddress(typed));

const ZUKAUSKAS: StoredPlayer = {
  id: player('9'),
  username: 'zuk',
  email: email('žukauskas@example.lt'),
  name: 'Žilvinas',
  surname: 'Žukauskas',
};

beforeEach(async () => {
  await saveWorld(db);
  await savePlayers(db, [ZUKAUSKAS]);
});

// sportbet's EmailCodeLoginTest, #41: the lookup is exact.
describe('findAccountByEmail', () => {
  it('finds the account under its own spelling', async () => {
    expect(await findAccountByEmail(db, email('žukauskas@example.lt'))).toEqual(
      { player: ZUKAUSKAS.id, email: 'žukauskas@example.lt' },
    );
  });

  it('finds nothing under the ASCII spelling of an accented address (#41)', async () => {
    expect(
      await findAccountByEmail(db, email('zukauskas@example.lt')),
    ).toBeUndefined();
  });

  it('finds nothing for an address no account has', async () => {
    expect(
      await findAccountByEmail(db, email('nobody@example.lt')),
    ).toBeUndefined();
  });
});

describe('player settings', () => {
  it("upserts a player's settings by player", async () => {
    await savePlayerSettings(db, [
      { player: ADA, locale: 'lt', role: 'player', lastTournament: null },
      { player: BEN, locale: 'en', role: 'superadmin', lastTournament: null },
    ]);
    await savePlayerSettings(db, [
      {
        player: ADA,
        locale: 'lt',
        role: 'results-manager',
        lastTournament: TOURNAMENT.id,
      },
    ]);
    expect(await listPlayerSettings(db)).toEqual([
      {
        player: ADA,
        locale: 'lt',
        role: 'results-manager',
        lastTournament: TOURNAMENT.id,
      },
      { player: BEN, locale: 'en', role: 'superadmin', lastTournament: null },
    ]);
  });
});

describe('listPlayerTournaments', () => {
  it("lists the tournaments a player plays, by id, and none of another's", async () => {
    await saveTournament(db, OTHER);
    const row = { switchedOff: false, adminHidden: false, fillIns: 0 };
    await saveTournamentPlayers(db, OTHER, [{ player: ADA, ...row }]);
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, ...row },
      { player: BEN, ...row },
    ]);
    expect(await listPlayerTournaments(db, ADA)).toEqual(
      [TOURNAMENT.id, OTHER.id].sort((a, b) => a - b),
    );
    expect(await listPlayerTournaments(db, ZUKAUSKAS.id)).toEqual([]);
  });
});

it('findTournamentById finds a tournament by its id, and nothing for another', async () => {
  expect(await findTournamentById(db, TOURNAMENT.id)).toEqual(TOURNAMENT);
  expect(await findTournamentById(db, 999_999)).toBeUndefined();
});

it("no account lookup folds an address: no ILIKE, unaccent, citext or email_fold outside the index and registration's uniqueness check (#16, #41)", () => {
  const area = join(import.meta.dirname, '..', 'src', 'account');
  const sources = readdirSync(area)
    .filter((name) => name.endsWith('.ts') && name !== 'schema.ts')
    .map((name) => ({ name, text: readFileSync(join(area, name), 'utf8') }));
  expect(sources.length).toBeGreaterThan(0);
  expect(
    sources
      .filter(
        ({ name, text }) =>
          /ilike|unaccent|citext/i.test(text) ||
          (name !== 'registration.ts' && /email_fold/i.test(text)),
      )
      .map(({ name }) => name),
  ).toEqual([]);
  // registration.ts folds in one place: isEmailRegistered's comparison.
  const registration = sources.find(({ name }) => name === 'registration.ts');
  expect(registration?.text.match(/email_fold\(/g)).toHaveLength(2);
});

describe('setLastTournament (R-28)', () => {
  it('account: writes the tournament the player used last, and clears it', async () => {
    await saveWorld(db);
    await savePlayerSettings(db, [
      { player: ADA, locale: 'lt', role: 'player', lastTournament: null },
    ]);
    await setLastTournament(db, ADA, TOURNAMENT.id);
    expect((await listPlayerSettings(db))[0]?.lastTournament).toBe(
      TOURNAMENT.id,
    );
    await setLastTournament(db, ADA, null);
    expect((await listPlayerSettings(db))[0]?.lastTournament).toBeNull();
  });

  it('account: a player without settings is a programmer error', async () => {
    await saveWorld(db);
    await expect(setLastTournament(db, ADA, TOURNAMENT.id)).rejects.toThrow(
      'setLastTournament: the player has no settings',
    );
  });
});
