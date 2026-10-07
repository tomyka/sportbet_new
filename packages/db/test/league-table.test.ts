// The league table (PointController::getAllUserPoints and
// getAllUsersGameHistory) on sportbet's golden scenario, under both sets.

import { ruledRules, sportbetRules, type RuleSet } from '@sportbet/domain';
import { testPlayer, player } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadLeagueTable, recalculateLocked, savePlayers } from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db } = useTestDatabase();

beforeEach(() => saveGolden(db));

const ada = IDS.player('ada');
const ben = IDS.player('ben');
const cai = IDS.player('cai');
const dan = IDS.player('dan');

async function tableUnder(rules: RuleSet) {
  expect(await recalculateLocked(db, GOLDEN_EL, rules)).toBeNull();
  return loadLeagueTable(db, GOLDEN_EL, rules);
}

describe('loadLeagueTable (R-73)', () => {
  it('lists the listed players ranked, with their parts, under sportbetRules', async () => {
    const table = await tableUnder(sportbetRules);
    expect(table.survival).toBe(true);
    expect(table.rows.map((row) => ({ ...row, history: undefined }))).toEqual([
      {
        player: ada,
        username: 'ada',
        rank: 1,
        totalCents: 193_400,
        matchCents: 26_000,
        serijaCents: 0,
        standingsCents: 164_000,
        survivalCents: 3_400,
        bingo: 1,
        stages: { place: 152_000, playOffs: 12_000, finalFour: 0, final: 0 },
      },
      {
        player: ben,
        username: 'ben',
        rank: 2,
        totalCents: 97_850,
        matchCents: 18_650,
        serijaCents: 0,
        standingsCents: 78_000,
        survivalCents: 1_200,
        bingo: 0,
        stages: { place: 72_000, playOffs: 6_000, finalFour: 0, final: 0 },
      },
      {
        player: cai,
        username: 'cai',
        rank: 3,
        totalCents: 42_750,
        matchCents: 39_750,
        serijaCents: 3_000,
        standingsCents: 0,
        survivalCents: 0,
        bingo: 0,
        stages: { place: 0, playOffs: 0, finalFour: 0, final: 0 },
      },
      {
        player: dan,
        username: 'dan',
        rank: 4,
        totalCents: 3_400,
        matchCents: 0,
        serijaCents: 0,
        standingsCents: 0,
        survivalCents: 3_400,
        bingo: 0,
        stages: { place: 0, playOffs: 0, finalFour: 0, final: 0 },
      },
    ]);
  });

  it('each row carries its history: standings and survival from the first game under sportbetRules', async () => {
    const table = await tableUnder(sportbetRules);
    const ada = table.rows[0];
    expect(
      ada?.history.map(({ game, totalCents, rank }) => [
        game,
        totalCents,
        rank,
      ]),
    ).toEqual([
      [IDS.game(1), 179_950, 1],
      [IDS.game(2), 175_450, 1],
      [IDS.game(3), 193_400, 1],
    ]);
  });

  it('under ruledRules: the ruled standings, and each counted from its game (R-17, R-72)', async () => {
    const table = await tableUnder(ruledRules);
    const [first] = table.rows;
    expect(first).toMatchObject({
      player: ada,
      rank: 1,
      totalCents: 123_400,
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
      [12_550, 12_550, 2],
      [9_250, -3_300, 3],
      [123_400, 114_150, 1],
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
    const table = await tableUnder(ruledRules);
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
    const table = await tableUnder(sportbetRules);
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
