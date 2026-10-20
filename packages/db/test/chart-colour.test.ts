// The chart colours (R-136): sportbet's colors.color_code on a player, migrated
// from production and written by no code since, read by the chart, refused by the column's CHECK unless it is
// #rrggbb. (invariant-checks.test.ts proves the CHECK on every example.)

import {
  chartColour,
  ruledRules,
  type ChartColour,
  type PlayerId,
} from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadChartColours, loadPointsChart } from '../src';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db } = useTestDatabase();

const ada = IDS.player('ada');
const ben = IDS.player('ben');
const cai = IDS.player('cai');

const colour = (code: string): ChartColour => unwrap(chartColour(code));

beforeEach(() => saveGolden(db));

// No writer is left in the code: a colour was migrated from sportbet, so a test
// puts one in the row as the migration left it.
const setColours = async (
  rows: readonly { player: PlayerId; colour: ChartColour }[],
): Promise<void> => {
  for (const { player: id, colour: code } of rows) {
    await db.execute(
      sql`update players set chart_colour = ${code} where id = ${Number(id)}`,
    );
  }
};

describe('loadChartColours', () => {
  it('reads back each colour of its player, and only of those who have one', async () => {
    await setColours([
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
    await setColours([
      { player: ada, colour: colour('#d96c6c') },
      { player: ben, colour: colour('#000000') },
    ]);
    expect(await loadChartColours(db, [ben])).toEqual(
      new Map([[ben, '#000000']]),
    );
    expect(await loadChartColours(db, [])).toEqual(new Map());
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
    await setColours([{ player: ben, colour: colour('#d96c6c') }]);
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
