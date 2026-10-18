// The chart colours (R-136): sportbet's colors.color_code on a player, set only
// by the reader, read by the chart, refused by the column's CHECK unless it is
// #rrggbb. (invariant-checks.test.ts proves the CHECK on every example.)

import { chartColour, ruledRules, type ChartColour } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadChartColours, loadPointsChart, restoreChartColours } from '../src';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db } = useTestDatabase();

const ada = IDS.player('ada');
const ben = IDS.player('ben');
const cai = IDS.player('cai');

const colour = (code: string): ChartColour => unwrap(chartColour(code));

beforeEach(() => saveGolden(db));

describe('restoreChartColours and loadChartColours', () => {
  it('restores each colour onto its player, and reads back only those who have one', async () => {
    await restoreChartColours(db, [
      { player: ada, colour: colour('#d96c6c') },
      { player: ben, colour: colour('#000000') },
    ]);
    expect(await loadChartColours(db, [ada, ben, cai])).toEqual(
      new Map([
        [ada, '#d96c6c'],
        [ben, '#000000'],
      ]),
    );
  });

  it('reads only the players asked for', async () => {
    await restoreChartColours(db, [
      { player: ada, colour: colour('#d96c6c') },
      { player: ben, colour: colour('#000000') },
    ]);
    expect(await loadChartColours(db, [ben])).toEqual(
      new Map([[ben, '#000000']]),
    );
    expect(await loadChartColours(db, [])).toEqual(new Map());
  });

  it('changes nothing for a player that is not saved', async () => {
    await restoreChartColours(db, [
      { player: IDS.player('ada'), colour: colour('#d96c6c') },
      { player: player('4000'), colour: colour('#ffffff') },
    ]);
    expect(
      await loadChartColours(db, [ada, ben, cai, IDS.player('dan')]),
    ).toEqual(new Map([[ada, '#d96c6c']]));
  });

  it('refuses a colour the domain would refuse, in the database too', async () => {
    await expect(
      db.execute(sql`update players set chart_colour = '#D96C6C'`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`update players set chart_colour = 'red'`),
    ).rejects.toThrow();
  });
});

describe('loadPointsChart', () => {
  it("draws a player's line with their colour and the others with none", async () => {
    await restoreChartColours(db, [{ player: ben, colour: colour('#d96c6c') }]);
    const chart = await loadPointsChart(db, {
      viewer: ada,
      tournament: GOLDEN_EL,
      rules: ruledRules,
    });
    const colours = new Map(
      chart.lines.map(({ player, colour: own }) => [player, own]),
    );
    expect(colours.get(ben)).toBe('#d96c6c');
    expect(colours.get(ada)).toBeNull();
    expect(colours.get(cai)).toBeNull();
  });
});
