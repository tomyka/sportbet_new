// sportbet's golden scenario saved through the repositories, with its
// production rows: shared by the database tests that start from it.

import {
  recalculateTournament,
  sportbetRules,
  type PointsRows,
  type Tournament,
} from '@sportbet/domain';
import {
  gameNo,
  GOLDEN,
  GOLDEN_POINTS,
  goldenInputs,
  goldenOdds,
  goldenSurvivalRows,
  player,
  team,
  testPlayer,
  unwrap,
  type GoldenIds,
} from '@sportbet/domain/testing';
import { savePlayers, saveTournamentSnapshot, type Db } from '../src';

/** sportbet's own ids for the golden rows (its golden dump numbers them so). */
export const IDS: GoldenIds = {
  player: (name) => player(String(GOLDEN.players.indexOf(name) + 1)),
  team: (name) => team(String(GOLDEN.teams.indexOf(name) + 5)),
  game: (id) => gameNo(id + 6),
};

export const GOLDEN_EL: Tournament = {
  id: 2,
  slug: 'golden-el',
  name: 'Golden EL',
  format: 'euroleague',
  endsOn: GOLDEN.endsOn,
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: GOLDEN.tableIsFinal,
};

/**
 * Production's rows, as the reader loads them: the stored odds and survival
 * rows of golden-points.json, and the match and standings rows it holds -
 * which are what the scenario recalculates to (the domain's golden test).
 */
function productionRows(): PointsRows {
  const derived = unwrap(
    recalculateTournament(goldenInputs({}, IDS), sportbetRules),
  );
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

/** The golden tournament, its players, inputs and production rows. */
export async function saveGolden(database: Db): Promise<void> {
  const inputs = goldenInputs({}, IDS);
  if (inputs.survival.from !== 'picks') {
    throw new Error('golden: the scenario holds a pick history');
  }
  await savePlayers(
    database,
    GOLDEN.players.map((name) => testPlayer(IDS.player(name), name)),
  );
  await saveTournamentSnapshot(database, {
    tournament: GOLDEN_EL,
    teams: GOLDEN.teams.map((name) => ({ id: IDS.team(name), name })),
    rounds: GOLDEN.rounds.map((round, index) => {
      const saved = inputs.season.rounds[index];
      if (saved === undefined) throw new Error('golden: a round is missing');
      return { id: index + 4, name: round.name, round: saved };
    }),
    games: inputs.season.games,
    outcomes: inputs.outcomes,
    players: inputs.players.map((id) => ({
      player: id,
      switchedOff: false,
      adminHidden: false,
      fillIns: 0,
    })),
    predictions: inputs.predictions,
    standings: inputs.standings,
    runs: inputs.survival.runs,
    production: productionRows(),
  });
}
