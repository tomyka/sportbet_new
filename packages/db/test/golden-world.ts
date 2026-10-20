// sportbet's golden scenario saved through the repositories: shared by the
// database tests that start from it.

import { type Tournament } from '@sportbet/domain';
import {
  gameNo,
  GOLDEN,
  goldenInputs,
  player,
  team,
  testPlayer,
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
  });
}
