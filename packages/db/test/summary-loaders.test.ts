// The summaries', chart's and compare's loaders on sportbet's golden scenario:
// each reads the rule set's own source and the standing's listed players.

import {
  ruledRules,
  sportbetRules,
  type RuleSet,
  type TournamentTotal,
} from '@sportbet/domain';
import { at, player, roundNo, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadCompare,
  loadPointsChart,
  loadResultsSummary,
  loadStandingsSummary,
  loadTournamentTotals,
  recalculateLocked,
} from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db } = useTestDatabase();

const NOW = at('2026-07-01T00:00:00Z');
const ada = IDS.player('ada');
const ben = IDS.player('ben');
const cai = IDS.player('cai');
const dan = IDS.player('dan');

beforeEach(() => saveGolden(db));

async function recalculate(...sets: readonly RuleSet[]): Promise<void> {
  for (const rules of sets) {
    expect(await recalculateLocked(db, GOLDEN_EL, rules)).toBeNull();
  }
}

/** A player's total as the table ranks it: the four kinds, to the cent. */
const totalCentsOf = (total: TournamentTotal): number =>
  total.match.hundredths +
  total.serija.hundredths +
  total.standings.toCents() +
  total.survival.hundredths;

const switchOff = (who: typeof ada) =>
  saveTournamentPlayers(db, GOLDEN_EL, [
    { player: who, switchedOff: true, adminHidden: false, fillIns: 0 },
  ]);

const results = (rules: RuleSet) =>
  loadResultsSummary(db, {
    viewer: ada,
    tournament: GOLDEN_EL,
    now: NOW,
    rules,
  });
const standings = (rules: RuleSet) =>
  loadStandingsSummary(db, { viewer: ada, tournament: GOLDEN_EL, rules });
const chart = (rules: RuleSet) =>
  loadPointsChart(db, { viewer: ada, tournament: GOLDEN_EL, rules });
const compare = (rules: RuleSet, viewer = ada, other = ben) =>
  loadCompare(db, { viewer, other, tournament: GOLDEN_EL, rules });

describe('the summaries read the rule set`s own source only', () => {
  it('a sportbet row never shows under ruledRules', async () => {
    await recalculate(sportbetRules);
    const { summary } = await results(ruledRules);
    const cell = summary.rounds[0]?.games[0]?.cells.get(ada);
    expect(cell?.points?.totalTenths).toBe(0);
    expect(summary.totalTenths.get(ada)).toBe(0);
    for (const line of (await chart(ruledRules)).lines) {
      expect(line.totalsCents.at(-1)).toBe(0);
    }
    const ruled = unwrap(await compare(ruledRules));
    expect(ruled.me.totalCents).toBe(0);
    const zal = (await standings(ruledRules)).teams.find(
      ({ name }) => name === 'ZAL',
    );
    expect(zal?.cells.get(ada)?.totalTenths).toBe(0);
  });

  it('a ruled row never shows under sportbetRules, and shows under ruledRules', async () => {
    await recalculate(ruledRules);
    // R-138: ada's match points are 121.5 - 140 + 229.5 = 211.
    expect((await results(ruledRules)).summary.totalTenths.get(ada)).toBe(
      2_110,
    );
    expect(unwrap(await compare(ruledRules)).me.totalCents).toBe(121_900);
    expect(
      (await standings(ruledRules)).teams[0]?.cells.get(ada)?.place.popover,
    ).toMatchObject({ pointsTenths: 1_900 });
    expect((await results(sportbetRules)).summary.totalTenths.get(ada)).toBe(0);
    expect(unwrap(await compare(sportbetRules)).me.totalCents).toBe(0);
    expect(
      (await standings(sportbetRules)).teams[0]?.cells.get(ada)?.totalTenths,
    ).toBe(0);
  });
});

describe('the summaries` roster is the listed players (RA-4, R-73)', () => {
  beforeEach(async () => {
    await recalculate(ruledRules);
    await switchOff(cai);
  });

  it('leaves a switched-off player out of every column and line', async () => {
    const names = (columns: readonly { username: string }[]) =>
      columns.map(({ username }) => username);
    expect(names((await results(ruledRules)).summary.columns)).toEqual([
      'ada',
      'ben',
      'dan',
    ]);
    expect(names((await standings(ruledRules)).columns)).toEqual([
      'ada',
      'ben',
      'dan',
    ]);
    expect(names((await chart(ruledRules)).lines)).toEqual([
      'ada',
      'ben',
      'dan',
    ]);
  });

  it('reads no predictions of a player who is not listed', async () => {
    const { summary } = await results(ruledRules);
    for (const game of summary.rounds.flatMap((round) => round.games)) {
      expect(game.cells.has(cai)).toBe(false);
    }
  });

  it('refuses a player who is not listed, as the other or as the viewer', async () => {
    expect(await compare(ruledRules, ada, cai)).toEqual({
      ok: false,
      refusal: 'not-listed',
    });
    expect(await compare(ruledRules, cai, ada)).toEqual({
      ok: false,
      refusal: 'not-listed',
    });
    expect(await compare(ruledRules, ada, player('99'))).toEqual({
      ok: false,
      refusal: 'not-listed',
    });
  });
});

describe('what the loaders hand the domain', () => {
  it('the chart ends at the stored total of every listed player (R-85)', async () => {
    for (const rules of [sportbetRules, ruledRules]) {
      await recalculate(rules);
      const { totals } = await loadTournamentTotals(db, GOLDEN_EL, rules, [
        ada,
        ben,
        cai,
        dan,
      ]);
      const stored = new Map(totals.map((total) => [total.player, total]));
      const { lines } = await chart(rules);
      expect(lines).toHaveLength(4);
      for (const line of lines) {
        const total = stored.get(line.player);
        if (total === undefined)
          throw new Error('a listed player has no total');
        expect(line.totalsCents.at(-1)).toBe(totalCentsOf(total));
      }
    }
  });

  it('the results summary shows the started games with the players` predictions and the team names', async () => {
    await recalculate(ruledRules);
    const { summary, teamNames } = await results(ruledRules);
    expect(summary.rounds.map(({ name }) => name)).toEqual(['EL E2', 'EL E1']);
    expect(summary.rounds.map(({ open }) => open)).toEqual([true, false]);
    const game = summary.rounds[1]?.games[0];
    expect(game?.cells.get(ada)).toMatchObject({
      score: { home: 85, away: 80 },
      verdict: 'ok',
    });
    expect(game?.home && teamNames.get(game.home)).toBe('ZAL');
  });

  it('the standings summary lists the tournament`s teams by id with their names', async () => {
    await recalculate(ruledRules);
    const summary = await standings(ruledRules);
    expect(summary.teams.map(({ name }) => name)).toEqual([
      'ZAL',
      'OLY',
      'REA',
      'FEN',
    ]);
    expect(summary.teams[0]?.cells.get(ada)?.playOffs.verdict).toBe('hit');
    expect(summary.teams[0]?.cells.has(cai)).toBe(false);
  });

  it('compare names the rounds and refuses oneself', async () => {
    await recalculate(ruledRules);
    const comparison = unwrap(await compare(ruledRules));
    expect(comparison.rounds.map(({ round, name }) => [round, name])).toEqual([
      [roundNo(1), 'EL E1'],
      [roundNo(2), 'EL E2'],
    ]);
    expect(await compare(ruledRules, dan, dan)).toEqual({
      ok: false,
      refusal: 'self',
    });
  });
});
