// The league table (PointController::getAllUserPoints and
// getAllUsersGameHistory) on sportbet's golden scenario, under both sets.

import { StandingsPrediction } from '@sportbet/domain';
import { player, teamPick, testPlayer, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadLeagueMedals,
  loadLeagueTable,
  recalculateInOwnTransaction,
  savePlayers,
} from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { saveStandingsPredictions } from '../src/standings/repository';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db } = useTestDatabase();

beforeEach(() => saveGolden(db));

const ada = IDS.player('ada');
const cai = IDS.player('cai');
const dan = IDS.player('dan');

async function tableUnder() {
  await recalculateInOwnTransaction(db, GOLDEN_EL);
  return loadLeagueTable(db, GOLDEN_EL);
}

describe('loadLeagueTable (R-73)', () => {
  it('the ruled standings, and each counted from its game (R-17, R-72)', async () => {
    const table = await tableUnder();
    const [first] = table.rows;
    expect(first).toMatchObject({
      player: ada,
      rank: 1,
      // R-138: match 211 + survival 68 + standings 940.
      totalCents: 121_900,
      standingsCents: 94_000,
      stages: { place: 76_000, playOffs: 18_000, finalFour: 0, final: 0 },
    });
    expect(
      first?.history.map(({ totalCents, gainedCents, rank }) => [
        totalCents,
        gainedCents,
        rank,
      ]),
    ).toEqual([
      [12_150, 12_150, 2],
      [550, -11_600, 4],
      [121_900, 121_350, 1],
    ]);
    expect(table.rows.map(({ username }) => username)).toEqual([
      'ada',
      'ben',
      'cai',
      'dan',
    ]);
  });

  it('a switched-off player is not listed and takes no rank (R-7)', async () => {
    await saveTournamentPlayers(db, GOLDEN_EL, [
      { player: cai, switchedOff: true, adminHidden: false, fillIns: 0 },
    ]);
    const table = await tableUnder();
    expect(table.rows.map(({ username, rank }) => [username, rank])).toEqual([
      ['ada', 1],
      ['ben', 2],
      ['dan', 3],
    ]);
    expect(table.rows[1]?.history.map(({ rank }) => rank)).toEqual([2, 1, 2]);
  });

  it('a listed player without a points row is in the table with nothing (sportbet lists its whole roster)', async () => {
    const eve = player('5');
    await savePlayers(db, [testPlayer(eve, 'eve')]);
    await saveTournamentPlayers(db, GOLDEN_EL, [
      { player: eve, switchedOff: false, adminHidden: false, fillIns: 0 },
    ]);
    const table = await tableUnder();
    expect(table.rows.at(-1)).toMatchObject({
      player: eve,
      username: 'eve',
      rank: 5,
      totalCents: 0,
      bingo: 0,
    });
    expect(
      table.rows.at(-1)?.history.map(({ totalCents }) => totalCents),
    ).toEqual([0, 0, 0]);
  });
});

describe('loadLeagueMedals (MedalTally::forTournament, R-73)', () => {
  /** cai puts ZAL first and FEN second; dan FEN first. */
  async function saveFinalPlaces(): Promise<void> {
    await saveStandingsPredictions(db, GOLDEN_EL, [
      unwrap(
        StandingsPrediction.stored(cai, [
          teamPick(IDS.team('ZAL'), { finalPlace: 1 }),
          teamPick(IDS.team('FEN'), { finalPlace: 2 }),
        ]),
      ),
      unwrap(
        StandingsPrediction.stored(dan, [
          teamPick(IDS.team('FEN'), { finalPlace: 1 }),
        ]),
      ),
    ]);
  }

  it("tallies the listed players' final places by team, whenever the tournament stands", async () => {
    await saveFinalPlaces();
    expect(await loadLeagueMedals(db, GOLDEN_EL)).toEqual([
      { team: 'FEN', first: 1, second: 1, third: 0, fourth: 0 },
      { team: 'ZAL', first: 1, second: 0, third: 0, fourth: 0 },
    ]);
  });

  it('leaves out a player who is not listed (R-7)', async () => {
    await saveFinalPlaces();
    await saveTournamentPlayers(db, GOLDEN_EL, [
      { player: dan, switchedOff: true, adminHidden: false, fillIns: 0 },
    ]);
    expect(await loadLeagueMedals(db, GOLDEN_EL)).toEqual([
      { team: 'ZAL', first: 1, second: 0, third: 0, fourth: 0 },
      { team: 'FEN', first: 0, second: 1, third: 0, fourth: 0 },
    ]);
  });
});
