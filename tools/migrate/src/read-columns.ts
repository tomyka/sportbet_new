import { z } from 'zod';

/**
 * A sportbet column the reader reads: the MySQL type it has at 3eb95e7 (as
 * `information_schema.columns.column_type` names it; the schema drift check
 * compares it, and whether it is nullable) and how its value is parsed. mysql2 returns DECIMAL, DOUBLE
 * (typeCast), DATE and DATETIME (dateStrings) and BLOB (typeCast) as text.
 */
const column = <T extends z.ZodType>(type: string, schema: T): T =>
  schema.describe(type);

const id = (type = 'bigint unsigned') => column(type, z.int().positive());
const maybeId = () => column('bigint unsigned', z.int().positive().nullable());
const whole = (type: string) => column(type, z.int());
const maybeWhole = (type: string) => column(type, z.int().nullable());
const text = (type: string) => column(type, z.string());
const maybeText = (type: string) => column(type, z.string().nullable());

/**
 * Every sportbet table and column the reader reads, and nothing else: the
 * only place the reader names a sportbet column, and every query selects
 * exactly these (no `select *` anywhere). From `users` it reads the id, the
 * username, the name, the surname, the email and when it was created (R-114,
 * slice 17) - the owner's consent for slice 4b, into the throwaway Postgres
 * only - and never a pending address, a Google id,
 * remember token or password; from `user_settings` the switch, the admin
 * level, the locale and whether it receives reminders (R-97, slice 16); from
 * `prediction_results` it also reads when a reminder was sent. From `tournaments` it reads the hub's profile too -
 * status, start date, sport, description and public switch (slice 5) -
 * never `cover_image`. From `leagues`, `league_members`, `league_invites` and
 * `messages` it reads what leagues are (#29): names, fees, the payment
 * details (beneficiary, IBAN, note), the amounts paid and the message texts
 * - R-103 lets the reader read them under the users' columns' rules, into
 * the throwaway Postgres only, counts only in reports - never
 * `use_league_odds`, which nothing reads. From `colors` it reads the `id` and
 * the `color_code` and nothing else (R-136: the chart's line colour of the player
 * whose id it is), onto the player only, counts only in reports. The audit tables, `login_codes`,
 * `sessions`, `settings` and football's `points_calculations` are not read at
 * all. Football's
 * columns (`last16`, `last32`, a prediction's `game_winner_id`) are read
 * only to count values that should not be there.
 */
export const READ_COLUMNS = {
  tournaments: z.object({
    id: id(),
    slug: text('varchar(255)'),
    name: text('varchar(255)'),
    standings_format: text('varchar(50)'),
    standings_deadline_round: maybeWhole('tinyint unsigned'),
    end_date: maybeText('date'),
    survival_game: whole('tinyint(1)'),
    sport: text('varchar(255)'),
    status: text("enum('upcoming','active','finished')"),
    start_date: maybeText('date'),
    description: maybeText('text'),
    is_public: whole('tinyint(1)'),
  }),
  events: z.object({
    id: id(),
    tournament_id: id(),
    event: text('varchar(255)'),
    event_day: whole('smallint'),
    event_survival: whole('tinyint'),
    is_knockout: whole('tinyint(1)'),
    rate: whole('tinyint'),
  }),
  teams: z.object({
    id: id(),
    tournament_id: id(),
    team: text('varchar(255)'),
    group_position: maybeWhole('tinyint'),
    quarterfinal: maybeWhole('tinyint'),
    semifinal: maybeWhole('tinyint'),
    final: maybeWhole('tinyint'),
    last16: maybeWhole('tinyint'),
    last32: maybeWhole('tinyint'),
  }),
  games: z.object({
    id: id(),
    event_id: id(),
    home_team_id: id(),
    away_team_id: id(),
    game_date: text('datetime'),
    home_team_score: maybeWhole('smallint'),
    away_team_score: maybeWhole('smallint'),
    game_winner_id: maybeWhole('bigint unsigned'),
  }),
  game_odds: z.object({
    id: id(),
    game_id: id(),
    home_odds: maybeText('decimal(8,2)'),
    away_odds: maybeText('decimal(8,2)'),
    draw_odds: maybeText('decimal(8,2)'),
  }),
  users: z.object({
    id: id(),
    username: text('varchar(255)'),
    name: text('varchar(255)'),
    surname: text('varchar(255)'),
    email: text('varchar(255)'),
    created_at: maybeText('timestamp'),
  }),
  user_settings: z.object({
    user_id: id(),
    active: whole('tinyint(1)'),
    admin: whole('tinyint'),
    locale: text('varchar(5)'),
    receive_reminders: whole('tinyint(1)'),
  }),
  colors: z.object({
    id: id(),
    color_code: text('varchar(255)'),
  }),
  leagues: z.object({
    id: id(),
    tournament_id: id(),
    name: text('varchar(255)'),
    description: maybeText('text'),
    is_public: whole('tinyint(1)'),
    owner_id: maybeId(),
    base_fee: maybeWhole('int'),
    penalty_step: maybeWhole('int'),
    reward_description: maybeText('text'),
    payment_beneficiary: maybeText('varchar(70)'),
    payment_iban: maybeText('varchar(34)'),
    payment_note: maybeText('text'),
    created_at: maybeText('timestamp'),
  }),
  league_members: z.object({
    id: id(),
    league_id: id(),
    user_id: id(),
    is_admin: whole('tinyint(1)'),
    is_guest: whole('tinyint(1)'),
    active: whole('tinyint(1)'),
    paid_amount: maybeText('decimal(8,2)'),
    created_at: maybeText('timestamp'),
  }),
  league_invites: z.object({
    id: id(),
    league_id: id(),
    invited_user_id: id(),
    invited_by_id: maybeId(),
    status: text("enum('pending','accepted','declined')"),
    created_at: maybeText('timestamp'),
  }),
  messages: z.object({
    id: id(),
    league_id: maybeId(),
    message: text('text'),
    active: whole('tinyint'),
  }),
  prediction_results: z.object({
    id: id(),
    user_id: id(),
    game_id: id(),
    home_team_score: maybeWhole('smallint'),
    away_team_score: maybeWhole('smallint'),
    generated: maybeText('blob'),
    game_winner_id: maybeWhole('smallint'),
    reminded_at: maybeText('timestamp'),
  }),
  prediction_standings: z.object({
    id: id(),
    user_id: id(),
    team_id: id(),
    group_position: maybeWhole('tinyint'),
    quarterfinal: maybeWhole('tinyint'),
    semifinal: maybeWhole('tinyint'),
    final: maybeWhole('tinyint'),
    last16: maybeWhole('tinyint'),
    last32: maybeWhole('tinyint'),
  }),
  prediction_survivals: z.object({
    id: id(),
    user_id: id(),
    team_id: id(),
    event_id: maybeWhole('smallint'),
  }),
  point_results: z.object({
    id: id(),
    user_id: id(),
    game_id: id(),
    winner_points: text('decimal(8,2)'),
    difference_points: text('decimal(8,2)'),
    bingo_points: text('decimal(8,2)'),
    odds: text('decimal(8,2)'),
    full_points: text('decimal(8,2)'),
    streak_bonus: text('decimal(8,2)'),
  }),
  point_standings: z.object({
    id: id(),
    user_id: id(),
    team_id: id(),
    group_position_points: maybeText('double'),
    group_position_odds: maybeText('double'),
    quarterfinal_points: maybeText('double'),
    quarterfinal_odds: maybeText('double'),
    semifinal_points: maybeText('double'),
    semifinal_odds: maybeText('double'),
    final_points: maybeText('double'),
    final_odds: maybeText('double'),
    last16_points: maybeText('double'),
    last16_odds: maybeText('double'),
    last32_points: maybeText('double'),
    last32_odds: maybeText('double'),
  }),
  point_survivals: z.object({
    id: id(),
    user_id: id(),
    event_id: id(),
    team_id: id(),
    survival_points: whole('smallint'),
  }),
};

export type SportbetTable = keyof typeof READ_COLUMNS;

export const SPORTBET_TABLES = Object.keys(READ_COLUMNS).filter(
  (table): table is SportbetTable => table in READ_COLUMNS,
);

/** One read row of a table, as its schema parses it. */
export type SportbetRow<T extends SportbetTable> = z.infer<
  (typeof READ_COLUMNS)[T]
>;

/** Every table's rows, as read. */
export type SportbetRows = { readonly [T in SportbetTable]: SportbetRow<T>[] };

/** The columns the reader selects from `table`, in order. */
export const columnsOf = (table: SportbetTable): string[] =>
  Object.keys(READ_COLUMNS[table].shape);

/** The MySQL type the reader expects `table.column` to have. */
export function expectedType(table: SportbetTable, name: string): string {
  const schema: unknown = Reflect.get(READ_COLUMNS[table].shape, name);
  const type = schema instanceof z.ZodType ? schema.description : undefined;
  if (type === undefined) {
    throw new Error(`READ_COLUMNS: ${table}.${name} has no MySQL type`);
  }
  return type;
}

/**
 * Whether the reader expects `table.column` to be nullable: exactly when
 * its schema accepts a null (the drift check compares it).
 */
export function expectedNullable(table: SportbetTable, name: string): boolean {
  const schema: unknown = Reflect.get(READ_COLUMNS[table].shape, name);
  if (!(schema instanceof z.ZodType)) {
    throw new Error(`READ_COLUMNS: ${table}.${name} has no schema`);
  }
  return schema.safeParse(null).success;
}

/** How each table's rows are read in key order, so a run is deterministic. */
export const ORDER_BY: Readonly<Record<SportbetTable, string>> = {
  tournaments: 'id',
  events: 'id',
  teams: 'id',
  games: 'id',
  game_odds: 'id',
  users: 'id',
  user_settings: 'user_id',
  colors: 'id',
  leagues: 'id',
  league_members: 'league_id, user_id',
  league_invites: 'id',
  messages: 'id',
  prediction_results: 'id',
  prediction_standings: 'id',
  prediction_survivals: 'id',
  point_results: 'id',
  point_standings: 'id',
  point_survivals: 'id',
};
