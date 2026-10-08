// The synthetic dump's scenario: the Euroleague part of sportbet's golden
// scenario (GOLDEN and GOLDEN_POINTS from @sportbet/domain/testing), a
// football tournament's rows, and deliberate quirks. Never production data:
// every name, surname, email, pending email, Google id, IP address and
// payment detail is a sentinel.

import { GOLDEN, GOLDEN_POINTS } from '@sportbet/domain/testing';
import type { Dump } from './dump-format';
import {
  decimal,
  EUROLEAGUE,
  goldenGame,
  IDS,
  UNSCORED_GAME,
} from './synthetic-ids';
import {
  pointResultRows,
  pointStandingsRows,
  pointSurvivalRows,
} from './synthetic-points';

const USERS = [...GOLDEN.players, 'eve', 'fbfan'] as const;

/** The golden league's payment details (sportbet 3eb95e7), never read. */
const PAYMENT = {
  payment_beneficiary: 'Sentinel-Beneficiary',
  payment_iban: 'LT00SENTINEL0IBAN',
  payment_note: 'Sentinel-Payment-Note',
} as const;
const PAYMENT_SENTINELS = Object.values(PAYMENT);

/** Every personal value in the dump; none may leave MySQL. */
export const SENTINELS: readonly string[] = [
  ...USERS.flatMap((user) => [
    `Sentinel-Name-${user}`,
    `Sentinel-Surname-${user}`,
    `sentinel.${user}@example.invalid`,
    `sentinel-google-${user}`,
    `sentinel-pending-${user}@example.invalid`,
  ]),
  '203.0.113.77',
  ...PAYMENT_SENTINELS,
];

/** The football tournament (skipped by design) and the golden Euroleague one. */
function tournamentRows(): Dump['tournaments'] {
  return [
    {
      id: 1,
      name: 'Golden FB',
      slug: 'golden-fb',
      sport: 'football',
      standings_format: 'football',
      status: 'active',
      is_public: 1,
      survival_game: 1,
    },
    {
      id: EUROLEAGUE,
      name: 'Golden EL',
      slug: 'golden-el',
      sport: 'basketball',
      standings_format: 'euroleague',
      status: 'active',
      end_date: GOLDEN.endsOn,
      is_public: 1,
      survival_game: 1,
    },
  ];
}

function eventRows(): Dump['events'] {
  return [
    {
      id: 1,
      tournament_id: 1,
      event: 'FB R1',
      event_day: 1,
      event_survival: 1,
      is_knockout: 0,
      active: 1,
      rate: 1,
    },
    ...GOLDEN.rounds.map((round) => ({
      id: IDS.event(round.number),
      tournament_id: EUROLEAGUE,
      event: round.name,
      event_day: round.number,
      event_survival: 1,
      is_knockout: round.knockout ? 1 : 0,
      active: 1,
      rate: 1,
    })),
  ];
}

function teamRows(): Dump['teams'] {
  return [
    {
      id: 1,
      tournament_id: 1,
      team: 'FRA',
      group_name: 'A',
      group_position: 1,
      last16: 1,
      quarterfinal: 1,
    },
    {
      id: 2,
      tournament_id: 1,
      team: 'ESP',
      group_name: 'A',
      group_position: 2,
      last16: 1,
    },
    ...GOLDEN.teams.map((name) => {
      const outcome = GOLDEN.outcomes.find(({ team }) => team === name);
      return {
        id: IDS.team(name),
        tournament_id: EUROLEAGUE,
        team: name,
        group_name: 'A',
        group_position: outcome?.place ?? null,
        quarterfinal: outcome?.playOffs === true ? 1 : null,
      };
    }),
  ];
}

function gameRows(): Dump['games'] {
  return [
    {
      id: 1,
      game_date: '2026-06-01 18:00:00',
      event_id: 1,
      home_team_id: 1,
      away_team_id: 2,
      home_team_score: 2,
      away_team_score: 0,
      reminder_sent: 0,
    },
    ...GOLDEN.games.map((game) => ({
      id: IDS.game(game.id),
      game_date: game.tipOff.replace('T', ' ').replace('Z', ''),
      event_id: IDS.event(game.round),
      home_team_id: IDS.team(game.home),
      away_team_id: IDS.team(game.away),
      home_team_score: game.result[0],
      away_team_score: game.result[1],
      reminder_sent: 0,
    })),
    {
      id: UNSCORED_GAME,
      game_date: '2026-06-21 18:00:00',
      event_id: IDS.event(2),
      home_team_id: IDS.team('REA'),
      away_team_id: IDS.team('OLY'),
      reminder_sent: 0,
    },
  ];
}

function gameOddsRows(): Dump['game_odds'] {
  return [
    {
      id: 1,
      game_id: 1,
      home_odds: '0.68',
      draw_odds: '2.26',
      away_odds: '2.59',
    },
    ...Object.entries(GOLDEN_POINTS.game_odds).map(([key, odds]) => {
      const game = IDS.game(goldenGame(key));
      return {
        id: game,
        game_id: game,
        home_odds: decimal(odds['home_odds']),
        draw_odds: decimal(odds['draw_odds']),
        away_odds: decimal(odds['away_odds']),
      };
    }),
    // sportbet's blank row, inserted with every game: odds 0, not 1.0.
    {
      id: 10,
      game_id: UNSCORED_GAME,
      home_odds: null,
      draw_odds: null,
      away_odds: null,
    },
    // A duplicate equal to the kept row: a notice. One that differs
    // refuses its game's odds (map.test.ts adds it).
    {
      id: 11,
      game_id: IDS.game(1),
      home_odds: '0.59',
      draw_odds: '2.59',
      away_odds: '1.59',
    },
  ];
}

/** Every user, with sentinel personal data; dan switched off (P20). */
function accountRows(): Pick<Dump, 'users' | 'user_settings'> {
  return {
    users: USERS.map((user, index) => ({
      id: index + 1,
      username: user,
      name: `Sentinel-Name-${user}`,
      surname: `Sentinel-Surname-${user}`,
      email: `sentinel.${user}@example.invalid`,
      pending_email: `sentinel-pending-${user}@example.invalid`,
      google_id: `sentinel-google-${user}`,
      remember_token: null,
    })),
    user_settings: USERS.map((user, index) => ({
      id: index + 1,
      user_id: index + 1,
      admin: 0,
      receive_reminders: 0,
      // dan is switched off, as production's one player is (P20).
      active: user === 'dan' ? 0 : 1,
      locale: 'lt',
    })),
  };
}

/** The football crowd league and the golden one, with its sentinel payment details. */
function leagueRows(): Pick<Dump, 'leagues' | 'league_members'> {
  return {
    leagues: [
      {
        id: 1,
        tournament_id: 1,
        name: 'Crowd',
        is_public: 0,
        use_league_odds: 1,
      },
      {
        id: 2,
        tournament_id: EUROLEAGUE,
        name: 'Golden league',
        is_public: 1,
        use_league_odds: 0,
        ...PAYMENT,
      },
    ],
    league_members: [
      { id: 1, league_id: 1, user_id: 6, is_admin: 0, is_guest: 0, active: 1 },
      { id: 2, league_id: 1, user_id: 3, is_admin: 0, is_guest: 0, active: 1 },
      ...GOLDEN.players.map((name, index) => ({
        id: index + 3,
        league_id: 2,
        user_id: IDS.player(name),
        is_admin: 0,
        is_guest: 0,
        active: 1,
      })),
    ],
  };
}

/** Rows the map refuses or keeps blank: an unpredicted game, an orphan, a '2' blob. */
const QUIRKY_PREDICTIONS: Dump['prediction_results'] = [
  // An unpredicted game's blank row (MS-2), generated NULL.
  {
    id: 12,
    user_id: IDS.player('dan'),
    game_id: UNSCORED_GAME,
    home_team_score: null,
    away_team_score: null,
    generated: null,
  },
  // A prediction for a game that does not exist.
  {
    id: 13,
    user_id: IDS.player('ben'),
    game_id: 999,
    home_team_score: 80,
    away_team_score: 70,
    generated: '0',
  },
  // A generated blob that is neither '1', '0' nor NULL.
  {
    id: 14,
    user_id: IDS.player('dan'),
    game_id: IDS.game(1),
    home_team_score: 85,
    away_team_score: 80,
    generated: '2',
  },
];

function predictionResultRows(): Dump['prediction_results'] {
  return [
    {
      id: 1,
      user_id: 1,
      game_id: 1,
      home_team_score: 2,
      away_team_score: 0,
      generated: '0',
    },
    {
      id: 2,
      user_id: 6,
      game_id: 1,
      home_team_score: 1,
      away_team_score: 0,
      generated: '1',
    },
    ...GOLDEN.predictions.map(([name, game, home, away], index) => ({
      id: index + 3,
      user_id: IDS.player(name),
      game_id: IDS.game(game),
      home_team_score: home,
      away_team_score: away,
      generated: '0',
    })),
    ...QUIRKY_PREDICTIONS,
  ];
}

function predictionStandingsRows(): Dump['prediction_standings'] {
  return [
    {
      id: 1,
      user_id: 1,
      team_id: 1,
      group_position: 1,
      last16: 1,
      quarterfinal: 1,
    },
    ...GOLDEN.standings
      .flatMap(([name, rows]) => rows.map((row) => ({ name, row })))
      .map(({ name, row }, index) => ({
        id: index + 2,
        user_id: IDS.player(name),
        team_id: IDS.team(row.team),
        group_position: row.place,
        quarterfinal: row.playOffs === true ? 1 : null,
      })),
  ];
}

function predictionSurvivalRows(): Dump['prediction_survivals'] {
  return [
    { id: 1, user_id: 1, team_id: 1, event_id: 1 },
    { id: 2, user_id: 1, team_id: 2, event_id: null },
    // One row per player and team, as sportbet seeds them; a pick sets
    // its event.
    ...GOLDEN.survival
      .flatMap(([name, picks]) =>
        GOLDEN.teams.map((team) => {
          const pick = picks.find(([, picked]) => picked === team);
          return {
            user_id: IDS.player(name),
            team_id: IDS.team(team),
            event_id: pick === undefined ? null : IDS.event(pick[0]),
          };
        }),
      )
      .map((row, index) => ({ id: index + 3, ...row })),
  ];
}

/**
 * The synthetic dump: sportbet's golden scenario with sportbet's ids, plus
 * a football tournament with a row in every table (skipped by design), a
 * user in no tournament, seeded survival slots, a switched-off player (dan),
 * an unscored game with sportbet's blank odds row, an equal and a
 * differing duplicate odds row, an orphan prediction and a `generated` of
 * '2' (refused), sentinel personal data on every user, and sentinel
 * payment details on the golden league.
 */
export function syntheticDump(): Dump {
  return {
    tournaments: tournamentRows(),
    events: eventRows(),
    teams: teamRows(),
    games: gameRows(),
    game_odds: gameOddsRows(),
    ...accountRows(),
    ...leagueRows(),
    prediction_results: predictionResultRows(),
    prediction_standings: predictionStandingsRows(),
    prediction_survivals: predictionSurvivalRows(),
    point_results: pointResultRows(),
    point_standings: pointStandingsRows(),
    point_survivals: pointSurvivalRows(),
    points_calculations: [],
    audit_logins: [
      {
        id: 1,
        user_id: '1',
        ip_address: '203.0.113.77',
        login_method: 'google',
      },
    ],
  };
}
