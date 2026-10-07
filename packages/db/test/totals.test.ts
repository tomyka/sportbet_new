import {
  MatchPrediction,
  recalculateTournament,
  ruledRules,
  sportbetRules,
  StandingsPrediction,
} from '@sportbet/domain';
import { teamPick, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  loadInputsUnderRuleSet,
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
  it("totals: the rule set's stored rows summed, equal to the totals recalculateTournament gave when it wrote them", async () => {
    await world();
    expect(await recalculateLocked(db, TOURNAMENT, ruledRules)).toBeNull();
    const inputs = unwrap(
      await loadInputsUnderRuleSet(db, TOURNAMENT, ruledRules),
    );
    const recalculated = unwrap(recalculateTournament(inputs, ruledRules));
    const { totals } = await loadTournamentTotals(db, TOURNAMENT, ruledRules);
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
    await recalculateLocked(db, TOURNAMENT, ruledRules);
    const { scored } = await loadTournamentTotals(db, TOURNAMENT, ruledRules);
    expect(scored).toEqual(new Set([ADA, BEN]));
  });

  it("totals: reads only the rule set's own source, never another's rows", async () => {
    await world();
    await recalculateLocked(db, TOURNAMENT, ruledRules);
    expect(await loadTournamentTotals(db, TOURNAMENT, sportbetRules)).toEqual({
      totals: [],
      scored: new Set(),
    });
  });
});
