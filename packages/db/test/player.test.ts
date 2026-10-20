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

  it("builds each player's status from the tournament's row: the counts of each tournament stay apart (R-7)", async () => {
    await saveTournament(db, OTHER);
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, switchedOff: false, adminHidden: false, fillIns: 3 },
      { player: BEN, switchedOff: true, adminHidden: false, fillIns: 5 },
    ]);
    await saveTournamentPlayers(db, OTHER, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 2 },
    ]);
    const here = tournamentKey(String(TOURNAMENT.id));
    const ruled = await loadPlayerStatuses(db, TOURNAMENT);
    expect([...ruled.keys()]).toEqual([ADA, BEN]);
    expect(ruled.get(ADA)?.fillInCount(here)).toBe(3);
    expect(ruled.get(ADA)?.isSwitchedOffIn(here)).toBe(false);
    expect(ruled.get(BEN)?.isSwitchedOffIn(here)).toBe(true);
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
