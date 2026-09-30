import { ruledRules, sportbetRules } from '@sportbet/domain';
import { tournamentKey } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  listPlayers,
  listTournamentPlayers,
  loadPlayerStatuses,
  savePlayers,
  saveTournament,
  saveTournamentPlayers,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, CAI, OTHER, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();

beforeEach(() => saveWorld(db));

describe('player repository', () => {
  it('keeps only the id and the username of a player', async () => {
    expect(await listPlayers(db)).toEqual([
      { id: ADA, username: 'ada' },
      { id: BEN, username: 'ben' },
      { id: CAI, username: 'cai' },
    ]);
    await savePlayers(db, [{ id: ADA, username: 'ada-2' }]);
    expect((await listPlayers(db))[0]).toEqual({ id: ADA, username: 'ada-2' });
  });

  it("lists a tournament's players, by id", async () => {
    await saveTournament(db, OTHER);
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: CAI, switchedOff: false, adminHidden: false, fillIns: 0 },
      { player: ADA, switchedOff: false, adminHidden: false, fillIns: 0 },
    ]);
    await saveTournamentPlayers(db, OTHER, [
      { player: BEN, switchedOff: false, adminHidden: false, fillIns: 0 },
    ]);
    expect(await listTournamentPlayers(db, TOURNAMENT)).toEqual([ADA, CAI]);
  });

  it("builds each player's status from every tournament's row: sportbet adds the counts up, the ruled set keeps them apart", async () => {
    await saveTournament(db, OTHER);
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, switchedOff: false, adminHidden: false, fillIns: 3 },
      { player: BEN, switchedOff: true, adminHidden: false, fillIns: 5 },
    ]);
    await saveTournamentPlayers(db, OTHER, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 2 },
    ]);
    const here = tournamentKey(String(TOURNAMENT.id));
    const sportbet = await loadPlayerStatuses(db, TOURNAMENT, sportbetRules);
    expect([...sportbet.keys()]).toEqual([ADA, BEN]);
    expect(sportbet.get(ADA)?.fillInCount(here, sportbetRules)).toBe(5);
    expect(sportbet.get(ADA)?.isSwitchedOffIn(here, sportbetRules)).toBe(true);
    const ruled = await loadPlayerStatuses(db, TOURNAMENT, ruledRules);
    expect(ruled.get(ADA)?.fillInCount(here, ruledRules)).toBe(3);
    expect(ruled.get(ADA)?.isSwitchedOffIn(here, ruledRules)).toBe(false);
    expect(ruled.get(BEN)?.isSwitchedOffIn(here, ruledRules)).toBe(true);
  });

  it('refuses a separate admin hide under the sportbet set, naming the table', async () => {
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, switchedOff: false, adminHidden: true, fillIns: 0 },
    ]);
    await expect(
      loadPlayerStatuses(db, TOURNAMENT, sportbetRules),
    ).rejects.toThrow(/tournament_players 1.*admin-hide-is-the-switch/);
    const ruled = await loadPlayerStatuses(db, TOURNAMENT, ruledRules);
    expect(ruled.get(ADA)?.adminHidden).toBe(true);
  });
});
