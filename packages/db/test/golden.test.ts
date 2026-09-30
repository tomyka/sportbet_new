// sportbet's golden scenario saved through the repositories and read back
// with loadTournamentInputs: the domain's golden master (golden.test.ts in
// packages/domain), now across the database.

import {
  recalculateTournament,
  ruledRules,
  sportbetRules,
  type GameId,
  type PointsRows,
  type RuleSet,
  type Tournament,
  type TournamentInputs,
} from '@sportbet/domain';
import {
  gameNo,
  GOLDEN,
  GOLDEN_POINTS,
  GOLDEN_POINTS_RULED,
  goldenInputs,
  goldenOdds,
  goldenSurvivalRows,
  player,
  snapshotOf,
  team,
  unwrap,
  type GoldenIds,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadTournamentInputs,
  loadTournamentPoints,
  saveGames,
  saveMatchPredictions,
  savePlayers,
  saveRounds,
  saveStandingsPredictions,
  saveSurvivalPicks,
  saveTeamOutcomes,
  saveTeams,
  saveTournament,
  saveTournamentPlayers,
  saveTournamentPoints,
  type Db,
  type InputReads,
} from '../src';
import { useTestDatabase } from '../src/testing';

const { db } = useTestDatabase();

/** sportbet's own ids for the golden rows (its golden dump numbers them so). */
const IDS: GoldenIds = {
  player: (name) => player(String(GOLDEN.players.indexOf(name) + 1)),
  team: (name) => team(String(GOLDEN.teams.indexOf(name) + 5)),
  game: (id) => gameNo(id + 6),
};

const GOLDEN_EL: Tournament = {
  id: 2,
  slug: 'golden-el',
  name: 'Golden EL',
  format: 'euroleague',
  endsOn: GOLDEN.endsOn,
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: GOLDEN.tableIsFinal,
};

const FROM_VOTES: InputReads = { odds: 'from-votes', survival: 'picks' };
const AS_STORED: InputReads = { odds: 'stored', survival: 'stored-rows' };

const inputsOf = async (reads: InputReads) =>
  unwrap(await loadTournamentInputs(db, GOLDEN_EL, reads, 'production'));

const recalculate = (inputs: TournamentInputs, rules: RuleSet) =>
  unwrap(recalculateTournament(inputs, rules));

/**
 * Production's rows, as the reader loads them: the stored odds and survival
 * rows of golden-points.json, and the match and standings rows it holds -
 * which are what the scenario recalculates to (the domain's golden test).
 */
function productionRows(): PointsRows {
  const derived = recalculate(goldenInputs({}, IDS), sportbetRules);
  return {
    odds: [...goldenOdds(GOLDEN_POINTS.game_odds, IDS)].map(([game, odds]) => ({
      game,
      odds,
    })),
    matches: derived.matches,
    standings: derived.standings,
    survival: goldenSurvivalRows(GOLDEN_POINTS.point_survivals, IDS).map(
      (row) => ({
        player: row.player,
        round: row.round,
        team: row.team,
        points: row.storedPoints,
        provisional: false,
        storedId: row.id,
      }),
    ),
  };
}

async function saveGolden(database: Db): Promise<void> {
  const inputs = goldenInputs({}, IDS);
  await saveTournament(database, GOLDEN_EL);
  await saveTeams(
    database,
    GOLDEN_EL,
    GOLDEN.teams.map((name) => ({ id: IDS.team(name), name })),
  );
  await saveRounds(
    database,
    GOLDEN_EL,
    GOLDEN.rounds.map((round, index) => {
      const saved = inputs.season.rounds[index];
      if (saved === undefined) throw new Error('golden: a round is missing');
      return { id: index + 4, name: round.name, round: saved };
    }),
  );
  await savePlayers(
    database,
    GOLDEN.players.map((name) => ({ id: IDS.player(name), username: name })),
  );
  await saveTournamentPlayers(
    database,
    GOLDEN_EL,
    inputs.players.map((id) => ({
      player: id,
      switchedOff: false,
      adminHidden: false,
      fillIns: 0,
    })),
  );
  await saveGames(database, GOLDEN_EL, inputs.season.games);
  await saveTeamOutcomes(database, GOLDEN_EL, inputs.outcomes);
  await saveMatchPredictions(database, GOLDEN_EL, inputs.predictions);
  await saveStandingsPredictions(database, GOLDEN_EL, inputs.standings);
  if (inputs.survival.from !== 'picks') {
    throw new Error('golden: the scenario holds a pick history');
  }
  await saveSurvivalPicks(database, GOLDEN_EL, inputs.survival.runs);
  await saveTournamentPoints(
    database,
    GOLDEN_EL,
    'production',
    productionRows(),
  );
}

beforeEach(() => saveGolden(db));

const byGameThenPlayer = <T extends { game: GameId; player: string }>(
  rows: readonly T[],
) =>
  [...rows].sort((a, b) => a.game - b.game || a.player.localeCompare(b.player));

describe('golden master across the database', () => {
  it('golden (db): the saved scenario reads back as its own inputs', async () => {
    const loaded = await inputsOf(FROM_VOTES);
    const golden = goldenInputs({}, IDS);
    expect(loaded.season).toEqual(golden.season);
    expect(loaded.players).toEqual(golden.players);
    expect(byGameThenPlayer(loaded.predictions)).toEqual(
      byGameThenPlayer(golden.predictions),
    );
    expect(loaded.standings).toEqual(golden.standings);
    expect(loaded.outcomes).toEqual(golden.outcomes);
    expect(loaded.odds).toBe('from-votes');
    expect(loaded.survival).toEqual(golden.survival);
  });

  it("golden (db): the stored reads are production's odds and survival rows, by sportbet id", async () => {
    const loaded = await inputsOf(AS_STORED);
    expect(loaded.odds).toEqual(goldenOdds(GOLDEN_POINTS.game_odds, IDS));
    expect(loaded.survival).toEqual({
      from: 'stored-rows',
      rows: goldenSurvivalRows(GOLDEN_POINTS.point_survivals, IDS),
    });
  });

  it('golden (db): production reads back as golden-points.json', async () => {
    expect(
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, 'production'), IDS),
    ).toEqual(GOLDEN_POINTS);
  });

  it('golden (db): reproduces every entry under sportbetRules from the votes and the picks', async () => {
    const inputs = await inputsOf(FROM_VOTES);
    expect(snapshotOf(recalculate(inputs, sportbetRules), IDS)).toEqual(
      GOLDEN_POINTS,
    );
  });

  it('golden (db): reproduces every entry under sportbetRules from the stored odds and survival rows (CO-7, SU-10)', async () => {
    const inputs = await inputsOf(AS_STORED);
    expect(snapshotOf(recalculate(inputs, sportbetRules), IDS)).toEqual(
      GOLDEN_POINTS,
    );
  });

  it('golden (db, ruled): differs from sportbet exactly where the rulings say', async () => {
    const inputs = await inputsOf(FROM_VOTES);
    expect(snapshotOf(recalculate(inputs, ruledRules), IDS)).toEqual(
      GOLDEN_POINTS_RULED,
    );
  });

  it('golden (db): a recalculation saved under its rule set reads back as the same rows', async () => {
    const inputs = await inputsOf(AS_STORED);
    await saveTournamentPoints(
      db,
      GOLDEN_EL,
      'sportbet',
      recalculate(inputs, sportbetRules),
    );
    const ruledInputs = await inputsOf(FROM_VOTES);
    await saveTournamentPoints(
      db,
      GOLDEN_EL,
      'ruled',
      recalculate(ruledInputs, ruledRules),
    );
    expect(
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, 'sportbet'), IDS),
    ).toEqual(GOLDEN_POINTS);
    expect(
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, 'ruled'), IDS),
    ).toEqual(GOLDEN_POINTS_RULED);
    // Each sportbet survival row rewrites the production row of its id.
    const sportbet = await loadTournamentPoints(db, GOLDEN_EL, 'sportbet');
    expect(sportbet.survival.map((row) => row.storedId).toSorted()).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });
});
