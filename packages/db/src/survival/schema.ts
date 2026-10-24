import {
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
} from 'drizzle-orm/pg-core';
import { players } from '../player/schema';
import { rounds } from '../season/schema';
import { teams } from '../team/schema';

/**
 * The survival pick history, one pick per player and round (R-5: never
 * deleted to record a loss). The team and the round are in one tournament.
 */
export const survivalPicks = pgTable(
  'survival_picks',
  {
    playerId: integer('player_id').notNull(),
    tournamentId: integer('tournament_id').notNull(),
    roundId: integer('round_id').notNull(),
    teamId: integer('team_id').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'survival_picks_pk',
      columns: [table.playerId, table.roundId],
    }),
    foreignKey({
      name: 'survival_picks_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'survival_picks_round_fk',
      columns: [table.tournamentId, table.roundId],
      foreignColumns: [rounds.tournamentId, rounds.id],
    }).onDelete('restrict'),
    // A tournament's picks are read by tournament; also indexes the round key.
    index('survival_picks_tournament_round_idx').on(
      table.tournamentId,
      table.roundId,
    ),
    foreignKey({
      name: 'survival_picks_team_fk',
      columns: [table.tournamentId, table.teamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
  ],
);

/**
 * Each saved survival pick (R-140; sportbet kept none): the card chosen and
 * the one it replaced in that round (none the first time). Erased with the
 * account (R-25); starts empty at switch-over (as R-60). No IP is kept (R-45).
 */
export const auditSurvivalPicks = pgTable(
  'audit_survival_picks',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    playerId: integer('player_id').notNull(),
    tournamentId: integer('tournament_id').notNull(),
    roundId: integer('round_id').notNull(),
    teamId: integer('team_id').notNull(),
    oldTeamId: integer('old_team_id'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'audit_survival_picks_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'audit_survival_picks_round_fk',
      columns: [table.tournamentId, table.roundId],
      foreignColumns: [rounds.tournamentId, rounds.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'audit_survival_picks_team_fk',
      columns: [table.tournamentId, table.teamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'audit_survival_picks_old_team_fk',
      columns: [table.tournamentId, table.oldTeamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
    index('audit_survival_picks_player_idx').on(table.playerId),
    index('audit_survival_picks_round_idx').on(
      table.tournamentId,
      table.roundId,
    ),
  ],
);
