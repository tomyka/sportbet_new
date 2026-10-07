// The result write path against sportbet's golden scenario (design
// decision 12): every golden result entered one by one through saveResult
// must leave exactly the ruled points the domain's golden master holds.

import {
  recalculateTournament,
  ruledRules,
  sportbetRules,
  type PointsRows,
  type RuleSet,
  type Tournament,
  type TournamentInputs,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  GOLDEN,
  GOLDEN_POINTS,
  GOLDEN_POINTS_RULED,
  goldenInputs,
  goldenOdds,
  goldenSurvivalRows,
  player,
  score,
  scriptedDice,
  snapshotOf,
  team,
  testPlayer,
  unwrap,
  type GoldenIds,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadTournamentPoints,
  saveResult,
  savePlayers,
  saveTournamentSnapshot,
  type Db,
} from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';

const { db, client } = useTestDatabase();

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

beforeEach(() => saveGolden(db));

/** `iso` plus `hours`, as an instant. */
const hoursAfter = (iso: string, hours: number) =>
  at(
    new Date(Date.parse(iso) + hours * 3600 * 1000)
      .toISOString()
      .replace('.000Z', 'Z'),
  );

describe('the result write path against the golden scenario', () => {
  it('replay (ruled): entering the golden results one by one through saveResult reproduces GOLDEN_POINTS_RULED', async () => {
    // Every game unscored, then each result entered as an admin would, in
    // tip-off order, three hours after its tip-off. The scenario holds no
    // blank row, so no fill-in is made: the dice must never be rolled.
    const inputs = goldenInputs({}, IDS);
    await saveGames(
      db,
      GOLDEN_EL,
      inputs.season.games.map((game) => game.withoutResult()),
    );
    for (const spec of GOLDEN.games) {
      const result = await saveResult(
        db,
        {
          game: IDS.game(spec.id),
          entry: {
            kind: 'score',
            score: score(spec.result[0], spec.result[1]),
          },
          now: hoursAfter(spec.tipOff, 3),
          rules: ruledRules,
          by: IDS.player(GOLDEN.players[0]),
          dice: scriptedDice([]),
        },
        // Before every tip-off, so each save is judged at the `now` given.
        () => Promise.resolve(at('2026-06-01T00:00:00Z')),
      );
      expect(result).toEqual({ ok: true, value: null });
    }
    expect(
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, 'ruled'), IDS),
    ).toEqual(GOLDEN_POINTS_RULED);
  });

  it("replay (ruled): a blank row is filled in at its game's result with the dice's score, counted, and scored (FI-1, FI-2, R-7)", async () => {
    const inputs = goldenInputs({}, IDS);
    await saveGames(
      db,
      GOLDEN_EL,
      inputs.season.games.map((game) => game.withoutResult()),
    );
    const [first] = GOLDEN.games;
    const [blankPlayer] = GOLDEN.players;
    const playerKey = Number(IDS.player(blankPlayer));
    const gameKey = IDS.game(first.id);
    await client.query(
      'update match_predictions set home = null, away = null where player_id = $1 and game_id = $2',
      [playerKey, gameKey],
    );
    for (const spec of GOLDEN.games) {
      const result = await saveResult(
        db,
        {
          game: IDS.game(spec.id),
          entry: {
            kind: 'score',
            score: score(spec.result[0], spec.result[1]),
          },
          now: hoursAfter(spec.tipOff, 3),
          rules: ruledRules,
          by: IDS.player(GOLDEN.players[0]),
          // The one fill-in: home 55+10+10+10, away 55+5+5+5 (FI-2).
          dice:
            spec.id === first.id
              ? scriptedDice([10, 10, 10, 5, 5, 5])
              : scriptedDice([]),
        },
        () => Promise.resolve(at('2026-06-01T00:00:00Z')),
      );
      expect(result).toEqual({ ok: true, value: null });
    }
    const filled = await client.query(
      'select home, away, origin from match_predictions where player_id = $1 and game_id = $2',
      [playerKey, gameKey],
    );
    expect(filled.rows).toEqual([{ home: 85, away: 70, origin: 'fill-in' }]);
    const count = await client.query(
      'select fill_ins, switched_off from tournament_players where player_id = $1 and tournament_id = $2',
      [playerKey, GOLDEN_EL.id],
    );
    expect(count.rows).toEqual([{ fill_ins: 1, switched_off: false }]);
    const scored = (
      await loadTournamentPoints(db, GOLDEN_EL, 'ruled')
    ).matches.filter(
      ({ player: who, game }) =>
        who === IDS.player(blankPlayer) && game === gameKey,
    );
    expect(scored).toHaveLength(1);
  });
});
