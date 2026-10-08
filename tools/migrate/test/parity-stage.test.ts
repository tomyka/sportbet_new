import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, it } from 'vitest';
import { loadMapped, recalculateLoaded } from '../src/load';
import { mapSportbet, type Mapped } from '../src/map';
import { checkParity, type ParityInput } from '../src/parity/stage';
import { ReaderProblem } from '../src/problem';
import { readRows, syntheticDump } from './fixtures/sportbet-dump';

const { db } = useTestDatabase();

/** The synthetic dump loaded and recalculated, as a run leaves Postgres before parity. */
async function loaded(): Promise<{
  mapped: Mapped;
  input: Omit<ParityInput, 'oldApp'>;
}> {
  const mapped = mapSportbet(readRows(syntheticDump()));
  await loadMapped(db, mapped);
  const recalculations = await recalculateLoaded(
    db,
    mapped.tournaments.map(({ tournament }) => tournament),
  );
  return {
    mapped,
    input: {
      tag: '3eb95e7',
      backup: 'backup',
      mapped,
      ranks: [],
      leaderboard: [],
      recalculations,
    },
  };
}

const sum = (counts: Readonly<Record<string, number>>): number =>
  Object.values(counts).reduce((total, count) => total + count, 0);

// The parity stage on the loaded Postgres, in process: production's copy
// stands in for sportbet's recalculated one, as both oracles agree on the
// synthetic dump (its stored points are the golden scenario's).
describe('checkParity', () => {
  it('parity stage: compares every loaded tournament against both oracles and the rulings, and /leaderboard once all compared', async () => {
    const { mapped, input } = await loaded();
    const report = await checkParity(db, { ...input, oldApp: mapped });
    expect(report.tag).toBe('3eb95e7');
    expect(report.tournaments.map(({ tournament }) => tournament)).toEqual(
      mapped.tournaments.map(({ tournament }) => tournament.slug),
    );
    for (const each of report.tournaments) {
      expect(each.notCompared).toBeNull();
      expect(each.rulings).not.toBeNull();
      expect(sum(each.counts.point_results)).toBeGreaterThan(0);
    }
    expect(report.newCodeWrong).toBe(0);
    expect(report.leaderboard).not.toBeNull();
  });

  it('parity stage: a tournament whose sportbet recalculation was refused is not compared, nor is /leaderboard', async () => {
    const { mapped, input } = await loaded();
    const [first] = mapped.tournaments;
    if (first === undefined) throw new Error('the dump loads a tournament');
    const report = await checkParity(db, {
      ...input,
      oldApp: mapped,
      recalculations: [
        {
          tournament: first.tournament.id,
          rules: 'sportbet',
          refusal: 'odds-missing',
        },
      ],
    });
    expect(report.tournaments[0]).toMatchObject({
      tournament: first.tournament.slug,
      notCompared: 'the sportbet recalculation was refused (odds-missing)',
    });
    expect(report.leaderboard).toBeNull();
  });

  it("parity stage: a loaded tournament missing from sportbet's recalculated copy stops the run", async () => {
    const { mapped, input } = await loaded();
    await expect(
      checkParity(db, { ...input, oldApp: { ...mapped, tournaments: [] } }),
    ).rejects.toBeInstanceOf(ReaderProblem);
  });
});
