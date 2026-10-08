// The synthetic dump's production points rows: the golden points, with a
// football row in each table.

import { GOLDEN, GOLDEN_POINTS } from '@sportbet/domain/testing';
import type { Dump } from './dump-format';
import { decimal, double, golden, goldenGame, IDS } from './synthetic-ids';

export function pointResultRows(): Dump['point_results'] {
  return [
    {
      id: 1,
      user_id: 1,
      game_id: 1,
      winner_points: '50.00',
      difference_points: '20.00',
      bingo_points: '10.00',
      odds: '0.68',
      full_points: '80.00',
      streak_bonus: '0.00',
    },
    ...Object.entries(GOLDEN_POINTS.point_results).map(([key, row], index) => {
      const { player, rest } = golden(key);
      return {
        id: index + 2,
        user_id: IDS.player(player),
        game_id: IDS.game(goldenGame(rest)),
        winner_points: decimal(row['winner_points']),
        difference_points: decimal(row['difference_points']),
        bingo_points: decimal(row['bingo_points']),
        odds: decimal(row['odds']),
        full_points: decimal(row['full_points']),
        streak_bonus: decimal(row['streak_bonus']),
      };
    }),
  ];
}

export function pointStandingsRows(): Dump['point_standings'] {
  return [
    {
      id: 1,
      user_id: 1,
      team_id: 1,
      group_position_points: '6',
      group_position_odds: '1',
      last16_points: '6',
      last16_odds: '0',
      quarterfinal_points: '9',
      quarterfinal_odds: '0',
    },
    ...Object.entries(GOLDEN_POINTS.point_standings).map(
      ([key, row], index) => {
        const { player, rest } = golden(key);
        const team = GOLDEN.teams.find((each) => each === rest);
        if (team === undefined) throw new Error(`fixture: bad team ${rest}`);
        return {
          id: index + 2,
          user_id: IDS.player(player),
          team_id: IDS.team(team),
          ...Object.fromEntries(
            Object.entries(row).map(([column, value]) => [
              column,
              double(value),
            ]),
          ),
        };
      },
    ),
  ];
}

export function pointSurvivalRows(): Dump['point_survivals'] {
  return [
    { id: 1, user_id: 1, event_id: 1, team_id: 1, survival_points: 10 },
    ...Object.entries(GOLDEN_POINTS.point_survivals).map(
      ([key, row], index) => {
        const { player, rest } = golden(key);
        const round = rest === 'EL E1' ? 1 : 2;
        const team = GOLDEN.teams.find((each) => each === row['team_id']);
        if (team === undefined) throw new Error('fixture: bad survival team');
        return {
          id: index + 2,
          user_id: IDS.player(player),
          event_id: IDS.event(round),
          team_id: IDS.team(team),
          survival_points: Number(row['survival_points']),
        };
      },
    ),
  ];
}
