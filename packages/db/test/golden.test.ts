// sportbet's golden scenario saved through the repositories and read back
// with loadTournamentInputs: the domain's golden master (golden.test.ts in
// packages/domain), now across the database.

import {
  recalculateTournament,
  ruledRules,
  type GameId,
} from '@sportbet/domain';
import {
  GOLDEN_POINTS_RULED,
  goldenInputs,
  snapshotOf,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadTournamentInputs,
  loadTournamentPoints,
  recalculateLocked,
  type PointsSource,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db, client } = useTestDatabase();

const inputsOf = async () =>
  unwrap(await loadTournamentInputs(db, GOLDEN_EL, 'ruled'));

beforeEach(() => saveGolden(db));

const byGameThenPlayer = <T extends { game: GameId; player: string }>(
  rows: readonly T[],
) =>
  [...rows].sort((a, b) => a.game - b.game || a.player.localeCompare(b.player));

describe('golden master across the database', () => {
  it('golden (db): the saved scenario reads back as its own inputs', async () => {
    const loaded = await inputsOf();
    const golden = goldenInputs({}, IDS);
    expect(loaded.season).toEqual(golden.season);
    expect(loaded.players).toEqual(golden.players);
    expect(byGameThenPlayer(loaded.predictions)).toEqual(
      byGameThenPlayer(golden.predictions),
    );
    expect(loaded.standings).toEqual(golden.standings);
    expect(loaded.outcomes).toEqual(golden.outcomes);
    // R-99: the ruled rows exist only once saved, so none are read here.
    expect(loaded.odds).toEqual(new Map());
    expect(loaded.survival).toEqual(golden.survival);
  });

  it('golden (db, ruled): the saved scenario recalculates to the ruled golden rows', async () => {
    const inputs = await inputsOf();
    expect(snapshotOf(unwrap(recalculateTournament(inputs)), IDS)).toEqual(
      GOLDEN_POINTS_RULED,
    );
  });

  it("golden (db): recalculateUnderRuleSet saves under the rule set's own name, and leaves production alone", async () => {
    const points = async (source: PointsSource) =>
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, source), IDS);
    const production = await points('production');
    expect(await recalculateLocked(db, GOLDEN_EL, ruledRules)).toBeNull();
    expect(await points('ruled')).toEqual(GOLDEN_POINTS_RULED);
    expect(await points('production')).toEqual(production);
    expect(await points('sportbet')).toEqual(
      snapshotOf({ odds: [], matches: [], standings: [], survival: [] }, IDS),
    );
  });

  // R-138's post-deploy check, read-only: the same three queries an operator
  // runs against the live database after pressing "Perskaičiuoti taškus".
  // Each counts the rows of a source that do NOT follow the ruled formulas.
  const R138_CHECKS = {
    // margin = rate x (50 - 2 x |called margin - real margin|, +30 on the exact margin without the exact score)
    margin: `select count(*)::int as bad from match_points mp
      join match_predictions p on p.player_id = mp.player_id and p.game_id = mp.game_id
      join games g on g.id = mp.game_id
      join rounds r on r.tournament_id = g.tournament_id and r.id = g.round_id
      where mp.source = $1 and g.home_score is not null
        and mp.margin <> r.rate * (50 - 2 * abs((p.home - p.away) - (g.home_score - g.away_score))
          + case when (p.home - p.away) = (g.home_score - g.away_score)
                      and not (p.home = g.home_score and p.away = g.away_score) then 30 else 0 end)`,
    // bingo = 0, or 100 x rate for the exact score
    bingo: `select count(*)::int as bad from match_points mp
      join games g on g.id = mp.game_id
      join rounds r on r.tournament_id = g.tournament_id and r.id = g.round_id
      where mp.source = $1 and mp.bingo not in (0, 100 * r.rate)`,
    // every surviving round pays 20 or 24, so a run's total is a multiple of 4
    survival: `select count(*)::int as bad from survival_points
      where source = $1 and points is not null and mod(points, 4) <> 0`,
  } as const;

  it('golden (db): the R-138 verification queries find no stale row after a ruled recalculation, and do find production`s old rows', async () => {
    const bad = async (check: keyof typeof R138_CHECKS, source: PointsSource) =>
      (await client.query<{ bad: number }>(R138_CHECKS[check], [source]))
        .rows[0]?.bad;
    expect(await recalculateLocked(db, GOLDEN_EL, ruledRules)).toBeNull();
    for (const check of ['margin', 'bingo', 'survival'] as const) {
      expect([check, await bad(check, 'ruled')]).toEqual([check, 0]);
      expect([check, await bad(check, 'production')]).not.toEqual([check, 0]);
    }
  });

  it('golden (db): recalculating twice under one rule set leaves the same rows', async () => {
    await recalculateLocked(db, GOLDEN_EL, ruledRules);
    const once = await loadTournamentPoints(db, GOLDEN_EL, 'ruled');
    await recalculateLocked(db, GOLDEN_EL, ruledRules);
    expect(await loadTournamentPoints(db, GOLDEN_EL, 'ruled')).toEqual(once);
  });
});
