import {
  MatchPrediction,
  Points,
  recalculateTournament,
  StandingsPoints,
  StandingsPrediction,
} from '@sportbet/domain';
import { teamPick, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  loadTournamentInputs,
  loadTournamentTotals,
  recalculateLocked,
} from '../src';
import { saveMatchPredictions } from '../src/prediction/repository';
import { saveGames } from '../src/season/repository';
import { saveStandingsPredictions } from '../src/standings/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  G7,
  G8,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db } = useTestDatabase();

/** Ada and Ben predict game 7; Cai saves only a standings prediction. */
async function world(): Promise<void> {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [G7, G8]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await saveMatchPredictions(db, TOURNAMENT, [
    unwrap(
      MatchPrediction.stored({
        player: ADA,
        game: G7.id,
        home: 88,
        away: 79,
        origin: 'real',
        filledInAt: null,
      }),
    ),
    unwrap(
      MatchPrediction.stored({
        player: BEN,
        game: G7.id,
        home: 70,
        away: 80,
        origin: 'real',
        filledInAt: null,
      }),
    ),
  ]);
  await saveStandingsPredictions(db, TOURNAMENT, [
    unwrap(StandingsPrediction.stored(CAI, [teamPick('11', { place: 1 })])),
  ]);
}

describe('loadTournamentTotals', () => {
  it("totals: the stored rows summed, equal to the totals recalculateTournament gave when it wrote them", async () => {
    await world();
    expect(await recalculateLocked(db, TOURNAMENT)).toBeNull();
    const inputs = unwrap(await loadTournamentInputs(db, TOURNAMENT));
    const recalculated = unwrap(recalculateTournament(inputs));
    const { totals } = await loadTournamentTotals(db, TOURNAMENT);
    expect(new Set(totals)).toEqual(
      new Set(
        recalculated.totals.filter(({ player }) =>
          totals.some((each) => each.player === player),
        ),
      ),
    );
    expect(totals.map(({ player }) => player)).toContain(ADA);
  });

  it('totals: names the players with a match points row of the source (PlayerTotals::eligible)', async () => {
    await world();
    await recalculateLocked(db, TOURNAMENT);
    const { scored } = await loadTournamentTotals(db, TOURNAMENT);
    expect(scored).toEqual(new Set([ADA, BEN]));
  });

  it('totals: reads only the live source, never a retired row', async () => {
    await world();
    await seedRetiredRows(client, TOURNAMENT.id);
    expect(await loadTournamentTotals(db, TOURNAMENT)).toEqual({
      totals: [],
      scored: new Set(),
      rows: { odds: [], matches: [], standings: [], survival: [] },
    });
  });

  it('totals: the players given come first, each with zero without a row (a league table lists its roster)', async () => {
    await world();
    const { totals } = await loadTournamentTotals(db, TOURNAMENT, [CAI]);
    expect(totals).toEqual([
      {
        player: CAI,
        match: Points.ZERO,
        serija: Points.ZERO,
        standings: StandingsPoints.ZERO,
        survival: Points.ZERO,
      },
    ]);
  });
});
