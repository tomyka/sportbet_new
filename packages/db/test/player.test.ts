import { ruledRules, sportbetRules } from '@sportbet/domain';
import { testPlayer, tournamentKey } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  listPlayers,
  listTournamentPlayers,
  loadPlayerStatuses,
  savePlayers,
} from '../src';
import { saveTournament } from '../src/tournament/repository';
import { eq } from 'drizzle-orm';
import {
  lockPlayerStatuses,
  saveTournamentPlayers,
} from '../src/player/repository';
import { tournamentPlayers } from '../src/player/schema';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, CAI, OTHER, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();

beforeEach(() => saveWorld(db));

describe('player repository', () => {
  it('keeps the id, the username and the account of a player', async () => {
    expect(await listPlayers(db)).toEqual([
      testPlayer(ADA, 'ada'),
      testPlayer(BEN, 'ben'),
      testPlayer(CAI, 'cai'),
    ]);
    const renamed = { ...testPlayer(ADA, 'ada-2'), surname: 'Žukauskaitė' };
    await savePlayers(db, [renamed]);
    expect((await listPlayers(db))[0]).toEqual(renamed);
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

// The lock order every writer of a player's statuses keeps (savePrediction,
// slice 9's fill-in writer): their tournament_players rows, FOR UPDATE, in
// tournament id order.
describe('lockPlayerStatuses', () => {
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  beforeEach(async () => {
    await saveTournament(db, OTHER);
    await saveTournamentPlayers(db, OTHER, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 3 },
    ]);
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, switchedOff: false, adminHidden: false, fillIns: 1 },
      { player: BEN, switchedOff: false, adminHidden: false, fillIns: 0 },
    ]);
  });

  it("status lock: the player's rows only, by tournament id", async () => {
    const rows = await db.transaction((tx) => lockPlayerStatuses(tx, ADA));
    expect(rows).toEqual([
      {
        tournament: tournamentKey(String(TOURNAMENT.id)),
        switchedOff: false,
        adminHidden: false,
        fillIns: 1,
      },
      {
        tournament: tournamentKey(String(OTHER.id)),
        switchedOff: true,
        adminHidden: false,
        fillIns: 3,
      },
    ]);
  });

  it('status lock: a second writer waits for the first to commit, then reads what it wrote', async () => {
    let locked: () => void = () => undefined;
    const firstHolds = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const first = db.transaction(async (tx) => {
      await lockPlayerStatuses(tx, ADA);
      locked();
      await sleep(500);
      await tx
        .update(tournamentPlayers)
        .set({ adminHidden: true })
        .where(eq(tournamentPlayers.tournamentId, TOURNAMENT.id));
    });
    await firstHolds;
    const second = db.transaction((tx) => lockPlayerStatuses(tx, ADA));
    await first;
    expect((await second).map(({ adminHidden }) => adminHidden)).toEqual([
      true,
      false,
    ]);
  });
});
