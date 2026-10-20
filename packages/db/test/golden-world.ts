// sportbet's golden scenario saved through the repositories, with retired
// production rows beside it: shared by the database tests that start from it.

import {
  Points,
  recalculateTournament,
  type PointsRows,
  type Tournament,
} from '@sportbet/domain';
import {
  gameNo,
  GOLDEN,
  goldenInputs,
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
 * The rows production once stored, which stay in the database as retired
 * history that nothing reads. Their numbers differ from what the app scores
 * the scenario with, as sportbet's did: every margin a point higher, the
 * bingos and the survival rows halved (sportbet's 50 and 12 a round, numbered
 * from 1).
 */
function productionRows(): PointsRows {
  const derived = unwrap(recalculateTournament(goldenInputs({}, IDS)));
  const hundredths = (value: number) => unwrap(Points.ofHundredths(value));
  const half = (points: Points) => hundredths(points.hundredths / 2);
  return {
    odds: derived.odds,
    standings: derived.standings,
    matches: derived.matches.map((row) => ({
      ...row,
      points: {
        ...row.points,
        margin: hundredths(row.points.margin.hundredths + 100),
        bingo: half(row.points.bingo),
        full: hundredths(
          row.points.full.hundredths + 100 - row.points.bingo.hundredths / 2,
        ),
      },
    })),
    survival: derived.survival.map((row, index) => ({
      ...row,
      points: row.points === null ? null : half(row.points),
      storedId: index + 1,
    })),
  };
}

/** The golden tournament, its players, inputs and production rows. */
export async function saveGolden(database: Db): Promise<void> {
  const inputs = goldenInputs({}, IDS);
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
