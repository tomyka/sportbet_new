// The summaries' shared view: the listed players' rule is applied once, here.

import { ruledRules } from '@sportbet/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { recalculateLocked } from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { loadLeagueView } from '../src/summary/league-view';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db } = useTestDatabase();

const ada = IDS.player('ada');
const cai = IDS.player('cai');

async function recalculate(): Promise<void> {
  expect(await recalculateLocked(db, GOLDEN_EL, ruledRules)).toBeNull();
}

beforeEach(async () => {
  await saveGolden(db);
  await recalculate();
});

const view = () => loadLeagueView(db, GOLDEN_EL, ruledRules);

describe('loadLeagueView', () => {
  it('carries the table, season, standing and both name lookups', async () => {
    const { table, season, standing, teamNames, roundNames } = await view();
    expect(table.rows.map(({ username }) => username).sort()).toEqual([
      'ada',
      'ben',
      'cai',
      'dan',
    ]);
    expect(season.games.length).toBeGreaterThan(0);
    expect(standing.listed.size).toBe(4);
    expect([...teamNames.values()]).toContain('ZAL');
    expect([...roundNames.values()]).toContain('EL E1');
  });

  it('keeps only the listed players` items, in their order', async () => {
    await saveTournamentPlayers(db, GOLDEN_EL, [
      { player: cai, switchedOff: true, adminHidden: false, fillIns: 0 },
    ]);
    const { listedOnly, standing, table } = await view();
    const items = [{ player: ada }, { player: cai }];
    expect(listedOnly(items)).toEqual([{ player: ada }]);
    expect(standing.listed.has(cai)).toBe(false);
    expect(table.rows.some(({ player }) => player === cai)).toBe(false);
  });
});
