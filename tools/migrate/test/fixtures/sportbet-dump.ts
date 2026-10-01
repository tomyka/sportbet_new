// A synthetic sportbet dump: the Euroleague part of sportbet's golden
// scenario (GOLDEN and GOLDEN_POINTS from @sportbet/domain/testing), a
// football tournament's rows, and deliberate quirks, in the format
// DatabaseDumpWriter writes (header, per table DROP and CREATE, extended
// INSERTs a tuple a line, the completion marker). Never production data:
// every name, surname, email, Google id and IP address is a sentinel.

import {
  gameNo,
  GOLDEN,
  GOLDEN_POINTS,
  player,
  team,
  type GoldenIds,
} from '@sportbet/domain/testing';
import { READ_COLUMNS, type SportbetRows } from '../../src/read-columns';
import { CREATE_TABLE, type DumpTable } from './create-tables';

export type SqlValue = string | number | null;
export type DumpRow = Readonly<Record<string, SqlValue>>;
export type Dump = Readonly<Record<DumpTable, readonly DumpRow[]>>;

export const DUMP_TABLES = Object.keys(CREATE_TABLE).filter(
  (table): table is DumpTable => table in CREATE_TABLE,
);

/** A table's columns, in its CREATE TABLE order. */
export function columnsIn(table: DumpTable): string[] {
  return CREATE_TABLE[table]
    .split('\n')
    .flatMap((line) => /^ {2}`([a-z0-9_]+)` /.exec(line)?.[1] ?? []);
}

/** Columns sportbet stores as `double`: PHP writes them unquoted. */
const doubles = new Set(
  columnsIn('point_standings').filter(
    (column) => column.endsWith('_points') || column.endsWith('_odds'),
  ),
);

/** What PDO::quote (MySQL) puts before each character it escapes. */
const ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  "'": "\\'",
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\0': '\\0',
};

/** A value as PDO::quote (MySQL) and MySqlDumpDialect::quoteValue write it. */
function quote(column: string, value: SqlValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number' || doubles.has(column)) return String(value);
  const escaped = value.replace(
    /[\\'"\n\r\0]/g,
    (character) => ESCAPES[character] ?? character,
  );
  return `'${escaped}'`;
}

/**
 * The dump's text, as DatabaseDumpWriter writes it: tables sorted by name,
 * each dropped and created, then its rows. `engine` is the header's engine
 * line; `complete` false leaves the completion marker off.
 */
export function renderDump(
  dump: Dump,
  { engine = 'mysql 26.7.0', complete = true } = {},
): string {
  const tables = [...DUMP_TABLES].sort();
  const header = [
    '-- SportBet database dump',
    '--',
    '-- generated_at : 2026-09-29T02:17:08Z',
    `-- engine       : ${engine}`,
    '-- tag          : daily',
    `-- tables       : ${String(tables.length)}`,
    '-- no rows for  : (none)',
    '-- nulled       : users.remember_token',
    '--',
    '-- A synthetic dump for the production-copy reader tests: no real player.',
    '',
    '',
  ].join('\n');
  const preamble = [
    'SET NAMES utf8mb4',
    "SET time_zone = '+00:00'",
    'SET FOREIGN_KEY_CHECKS = 0',
    "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO'",
    'SET UNIQUE_CHECKS = 0',
  ]
    .map((statement) => `${statement};\n`)
    .join('');
  let rows = 0;
  let body = '';
  for (const table of tables) {
    body += `\n--\n-- ${table}\n--\n`;
    body += `DROP TABLE IF EXISTS \`${table}\`;\n${CREATE_TABLE[table]};\n`;
    const columns = columnsIn(table);
    const tuples = dump[table].map(
      (row) =>
        `(${columns.map((column) => quote(column, row[column] ?? null)).join(',')})`,
    );
    rows += tuples.length;
    if (tuples.length > 0) {
      body += `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES\n${tuples.join(',\n')};\n`;
    }
  }
  const postamble = 'SET UNIQUE_CHECKS = 1;\nSET FOREIGN_KEY_CHECKS = 1;\n';
  const footer = `\n--\n-- rows written : ${String(rows)}\n${complete ? '-- SPORTBET DUMP COMPLETE\n' : ''}`;
  return header + preamble + body + postamble + footer;
}

/**
 * The rows the reader reads from a restored copy of `dump`, as mysql2 hands
 * them over (READ_COLUMNS parses each and drops every column not read).
 */
export function readRows(dump: Dump): SportbetRows {
  // A column the fixture leaves out is NULL in the restored table.
  const all = (table: DumpTable) =>
    dump[table].map((row) =>
      Object.fromEntries(
        columnsIn(table).map((column) => [column, row[column] ?? null]),
      ),
    );
  return {
    tournaments: all('tournaments').map((row) =>
      READ_COLUMNS.tournaments.parse(row),
    ),
    events: all('events').map((row) => READ_COLUMNS.events.parse(row)),
    teams: all('teams').map((row) => READ_COLUMNS.teams.parse(row)),
    games: all('games').map((row) => READ_COLUMNS.games.parse(row)),
    game_odds: all('game_odds').map((row) => READ_COLUMNS.game_odds.parse(row)),
    users: all('users').map((row) => READ_COLUMNS.users.parse(row)),
    user_settings: all('user_settings').map((row) =>
      READ_COLUMNS.user_settings.parse(row),
    ),
    leagues: all('leagues').map((row) => READ_COLUMNS.leagues.parse(row)),
    league_members: all('league_members').map((row) =>
      READ_COLUMNS.league_members.parse(row),
    ),
    prediction_results: all('prediction_results').map((row) =>
      READ_COLUMNS.prediction_results.parse(row),
    ),
    prediction_standings: all('prediction_standings').map((row) =>
      READ_COLUMNS.prediction_standings.parse(row),
    ),
    prediction_survivals: all('prediction_survivals').map((row) =>
      READ_COLUMNS.prediction_survivals.parse(row),
    ),
    point_results: all('point_results').map((row) =>
      READ_COLUMNS.point_results.parse(row),
    ),
    point_standings: all('point_standings').map((row) =>
      READ_COLUMNS.point_standings.parse(row),
    ),
    point_survivals: all('point_survivals').map((row) =>
      READ_COLUMNS.point_survivals.parse(row),
    ),
  };
}

type Name = (typeof GOLDEN.players)[number];
type TeamName = (typeof GOLDEN.teams)[number];

/** sportbet's ids for the golden rows: the players 1-4, teams 5-8, games 7-9, events 4-5. */
export const IDS = {
  player: (name: Name) => GOLDEN.players.indexOf(name) + 1,
  team: (name: TeamName) => GOLDEN.teams.indexOf(name) + 5,
  game: (id: 1 | 2 | 3) => id + 6,
  event: (round: 1 | 2) => round + 3,
};

/** The golden names as the dump's sportbet ids, for the domain's golden helpers. */
export const DUMP_IDS: GoldenIds = {
  player: (name) => player(String(IDS.player(name))),
  team: (name) => team(String(IDS.team(name))),
  game: (id) => gameNo(IDS.game(id)),
};

/** The Euroleague tournament's id. */
export const EUROLEAGUE = 2;
/** An unscored Euroleague game with sportbet's blank odds row. */
export const UNSCORED_GAME = 10;

const USERS = [...GOLDEN.players, 'eve', 'fbfan'] as const;

/** Every personal value in the dump; none may leave MySQL. */
export const SENTINELS: readonly string[] = [
  ...USERS.flatMap((user) => [
    `Sentinel-Name-${user}`,
    `Sentinel-Surname-${user}`,
    `sentinel.${user}@example.invalid`,
    `sentinel-google-${user}`,
  ]),
  '203.0.113.77',
];

/** "380.0000" as PHP writes the double: 380. */
const double = (fourPlaces: string | null) =>
  fourPlaces === null ? null : String(Number(fourPlaces));
/** "79.5000" as the DECIMAL(8,2) text: 79.50. */
const decimal = (fourPlaces: string | undefined) => {
  if (fourPlaces === undefined) throw new Error('fixture: no such column');
  return fourPlaces.slice(0, -2);
};

/** A golden-points key, "ada / EL h2", as its player and the rest. */
const golden = (key: string) => {
  const [name, rest] = key.split(' / ');
  const player = GOLDEN.players.find((each) => each === name);
  if (player === undefined || rest === undefined) {
    throw new Error(`fixture: bad key ${key}`);
  }
  return { player, rest };
};

/** "EL h2" as the golden game 2. */
const goldenGame = (label: string) => {
  const game = GOLDEN.games.find(({ id }) => label === `EL h${String(id)}`);
  if (game === undefined) throw new Error(`fixture: bad game ${label}`);
  return game.id;
};

/**
 * The synthetic dump: sportbet's golden scenario with sportbet's ids, plus
 * a football tournament with a row in every table (skipped by design), a
 * user in no tournament, seeded survival slots, a switched-off player (dan),
 * an unscored game with sportbet's blank odds row, an equal and a
 * differing duplicate odds row, an orphan prediction and a `generated` of
 * '2' (refused), and sentinel personal data on every user.
 */
export function syntheticDump(): Dump {
  const eventOf = (round: 1 | 2) => IDS.event(round);
  return {
    tournaments: [
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
    ],
    events: [
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
        id: eventOf(round.number),
        tournament_id: EUROLEAGUE,
        event: round.name,
        event_day: round.number,
        event_survival: 1,
        is_knockout: round.knockout ? 1 : 0,
        active: 1,
        rate: 1,
      })),
    ],
    teams: [
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
    ],
    games: [
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
        event_id: eventOf(game.round),
        home_team_id: IDS.team(game.home),
        away_team_id: IDS.team(game.away),
        home_team_score: game.result[0],
        away_team_score: game.result[1],
        reminder_sent: 0,
      })),
      {
        id: UNSCORED_GAME,
        game_date: '2026-06-21 18:00:00',
        event_id: eventOf(2),
        home_team_id: IDS.team('REA'),
        away_team_id: IDS.team('OLY'),
        reminder_sent: 0,
      },
    ],
    game_odds: [
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
    ],
    users: USERS.map((user, index) => ({
      id: index + 1,
      username: user,
      name: `Sentinel-Name-${user}`,
      surname: `Sentinel-Surname-${user}`,
      email: `sentinel.${user}@example.invalid`,
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
    prediction_results: [
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
    ],
    prediction_standings: [
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
    ],
    prediction_survivals: [
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
              event_id: pick === undefined ? null : eventOf(pick[0]),
            };
          }),
        )
        .map((row, index) => ({ id: index + 3, ...row })),
    ],
    point_results: [
      {
        id: 1,
        user_id: 1,
        game_id: 1,
        winner_points: '50.00',
        difference_points: '20.00',
        bingo_points: '10.00',
        odds: '0.68',
        odds_points: '0.00',
        full_points: '80.00',
        streak_bonus: '0.00',
      },
      ...Object.entries(GOLDEN_POINTS.point_results).map(
        ([key, row], index) => {
          const { player, rest } = golden(key);
          return {
            id: index + 2,
            user_id: IDS.player(player),
            game_id: IDS.game(goldenGame(rest)),
            winner_points: decimal(row['winner_points']),
            difference_points: decimal(row['difference_points']),
            bingo_points: decimal(row['bingo_points']),
            odds: decimal(row['odds']),
            odds_points: decimal(row['odds_points']),
            full_points: decimal(row['full_points']),
            streak_bonus: decimal(row['streak_bonus']),
          };
        },
      ),
    ],
    point_standings: [
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
    ],
    point_survivals: [
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
            event_id: eventOf(round),
            team_id: IDS.team(team),
            survival_points: Number(row['survival_points']),
          };
        },
      ),
    ],
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
