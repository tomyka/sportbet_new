import { sportbetRules } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  loadMatchPredictions,
  loadPlayerStatuses,
  loadSeason,
  loadStandingsPredictions,
  loadTeamOutcomes,
  type Executor,
} from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournamentPlayers } from '../src/player/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, GAMES, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, GAMES);
  await saveTournamentPlayers(db, TOURNAMENT, [
    { player: ADA, switchedOff: false, adminHidden: false, fillIns: 0 },
  ]);
  await client.query(
    `insert into match_predictions (player_id, game_id, home, away, origin)
     values (1, 7, 80, 70, 'real')`,
  );
});

class RolledBack extends Error {}

/**
 * Runs `read` on a row its CHECK would refuse: the CHECK is dropped and the
 * row changed inside a transaction that is always rolled back, so the
 * database is left as it was. What `read` throws is returned.
 */
async function errorPastCheck(
  table: string,
  constraint: string,
  change: string,
  read: (tx: Executor) => Promise<unknown>,
): Promise<unknown> {
  let thrown: unknown;
  await db
    .transaction(async (tx) => {
      await tx.execute(
        sql.raw(`alter table ${table} drop constraint ${constraint}`),
      );
      await tx.execute(sql.raw(change));
      try {
        await read(tx);
      } catch (error) {
        thrown = error;
      }
      throw new RolledBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RolledBack)) throw error;
    });
  return thrown;
}

const season = (tx: Executor) => loadSeason(tx, TOURNAMENT);
const predictions = (tx: Executor) => loadMatchPredictions(tx, TOURNAMENT);
const outcomes = (tx: Executor) => loadTeamOutcomes(tx, TOURNAMENT);
const standings = (tx: Executor) => loadStandingsPredictions(tx, TOURNAMENT);

// A row parser reads each column through the invariant its CHECK holds, so
// a row the CHECK refuses is refused there, before any stored factory.
describe('row parsers', () => {
  it.each(
    (
      [
        [
          'a round number of 0',
          'rounds',
          'rounds_number_positive',
          'update rounds set number = 0 where number = 1',
          season,
        ],
        [
          'a round rate of 0',
          'rounds',
          'rounds_rate_positive',
          'update rounds set rate = 0',
          season,
        ],
        [
          "a game's negative home score",
          'games',
          'games_home_score_not_negative',
          'update games set home_score = -1 where id = 7',
          season,
        ],
        [
          "a game's negative away score",
          'games',
          'games_away_score_not_negative',
          'update games set away_score = -1 where id = 7',
          season,
        ],
        [
          "a prediction's negative home score",
          'match_predictions',
          'match_predictions_home_not_negative',
          'update match_predictions set home = -1',
          predictions,
        ],
        [
          "a prediction's negative away score",
          'match_predictions',
          'match_predictions_away_not_negative',
          'update match_predictions set away = -1',
          predictions,
        ],
        [
          'a team place of 0',
          'team_outcomes',
          'team_outcomes_place_positive',
          `insert into team_outcomes (team_id, place, play_offs, final_four, final_place)
       values (11, 0, false, false, null)`,
          outcomes,
        ],
        [
          "a team's final place of 5",
          'team_outcomes',
          'team_outcomes_final_place_range',
          `insert into team_outcomes (team_id, place, play_offs, final_four, final_place)
       values (11, null, false, false, 5)`,
          outcomes,
        ],
        [
          'a negative predicted place',
          'standings_predictions',
          'standings_predictions_place_not_negative',
          `insert into standings_predictions (player_id, team_id, place, play_offs, final_four, final_place)
       values (1, 11, -1, null, null, null)`,
          standings,
        ],
        [
          'a predicted final place of 5',
          'standings_predictions',
          'standings_predictions_final_place_range',
          `insert into standings_predictions (player_id, team_id, place, play_offs, final_four, final_place)
       values (1, 11, 1, null, null, 5)`,
          standings,
        ],
        [
          'a negative fill-in count',
          'tournament_players',
          'tournament_players_fill_ins_not_negative',
          'update tournament_players set fill_ins = -1',
          (tx: Executor) => loadPlayerStatuses(tx, TOURNAMENT, sportbetRules),
        ],
      ] as const
    ).map(([label, table, constraint, change, read]) => ({
      label,
      table,
      constraint,
      change,
      read,
    })),
  )(
    '$label is refused by its invariant',
    async ({ table, constraint, change, read }) => {
      expect(
        await errorPastCheck(table, constraint, change, read),
      ).toBeInstanceOf(ZodError);
    },
  );
});
