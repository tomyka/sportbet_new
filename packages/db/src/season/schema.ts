import {
  rateInvariant,
  roundNumberInvariant,
  scoreSideInvariant,
  STAGES,
} from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { teams } from '../team/schema';
import { tournaments } from '../tournament/schema';

/** Built from the domain's list, so the enum and the type cannot drift. */
export const stageEnum = pgEnum('stage', STAGES);

/** A tournament's rounds: sportbet's `events`. */
export const rounds = pgTable(
  'rounds',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer('tournament_id').notNull(),
    /** sportbet's `event_day`: the domain's RoundNumber. */
    number: smallint('number').notNull(),
    /** sportbet's `events.event`, e.g. "1 turas"; display only. */
    name: text('name').notNull(),
    stage: stageEnum('stage').notNull(),
    rate: smallint('rate').notNull(),
    survival: boolean('survival').notNull(),
    knockout: boolean('knockout').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'rounds_tournament_fk',
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete('restrict'),
    // Season.create refuses a duplicate round.
    unique('rounds_tournament_number_unique').on(
      table.tournamentId,
      table.number,
    ),
    // The target of the composite foreign keys that keep a game, and a
    // survival pick, in its round's tournament.
    unique('rounds_tournament_id_id_unique').on(table.tournamentId, table.id),
    ...roundInvariantChecks.map(invariantCheck),
  ],
);

export const games = pgTable(
  'games',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer('tournament_id').notNull(),
    roundId: integer('round_id').notNull(),
    homeTeamId: integer('home_team_id').notNull(),
    awayTeamId: integer('away_team_id').notNull(),
    tipOff: timestamp('tip_off', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    homeScore: smallint('home_score'),
    awayScore: smallint('away_score'),
    /** sportbet's `game_winner_id` (MS-10). */
    recordedWinnerId: integer('recorded_winner_id'),
    /** R-41; false for every sportbet row. */
    postponed: boolean('postponed').notNull().default(false),
    /** R-13; null for every sportbet row. */
    lockedSince: timestamp('locked_since', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    // A game's round and both its teams are in one tournament (P17).
    foreignKey({
      name: 'games_round_fk',
      columns: [table.tournamentId, table.roundId],
      foreignColumns: [rounds.tournamentId, rounds.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'games_home_team_fk',
      columns: [table.tournamentId, table.homeTeamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'games_away_team_fk',
      columns: [table.tournamentId, table.awayTeamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
    // Every load reads a tournament's games; also indexes games_round_fk.
    index('games_tournament_round_idx').on(table.tournamentId, table.roundId),
    // D16(c): one game per round and pair of teams.
    unique('games_round_teams_unique').on(
      table.roundId,
      table.homeTeamId,
      table.awayTeamId,
    ),
    // Game.stored: same-team-twice.
    check(
      'games_teams_differ',
      sql`${table.homeTeamId} <> ${table.awayTeamId}`,
    ),
    // sportbetColumns.game: half-scored.
    check(
      'games_result_both_or_neither',
      sql`(${table.homeScore} is null) = (${table.awayScore} is null)`,
    ),
    // Game.stored: winner-without-result.
    check(
      'games_winner_needs_result',
      sql`${table.recordedWinnerId} is null or ${table.homeScore} is not null`,
    ),
    // Game.stored: winner-not-in-game. With the two team keys above, it
    // also keeps the winner in the game's tournament.
    check(
      'games_winner_in_game',
      sql`${table.recordedWinnerId} is null or ${table.recordedWinnerId} in (${table.homeTeamId}, ${table.awayTeamId})`,
    ),
    // Game.stored: postponed-with-result.
    check(
      'games_postponed_without_result',
      sql`not ${table.postponed} or ${table.homeScore} is null`,
    ),
    ...gameInvariantChecks.map(invariantCheck),
  ],
);

/** Every invariant CHECK on `rounds`. */
export const roundInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'rounds_number_positive',
    column: rounds.number,
    invariant: roundNumberInvariant,
  },
  {
    constraint: 'rounds_rate_positive',
    column: rounds.rate,
    invariant: rateInvariant,
  },
];

/** Every invariant CHECK on `games`; its cross-column CHECKs are above. */
export const gameInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'games_home_score_not_negative',
    column: games.homeScore,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'games_away_score_not_negative',
    column: games.awayScore,
    invariant: scoreSideInvariant,
  },
];
