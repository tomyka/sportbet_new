import { foreignKey, integer, pgTable, primaryKey } from 'drizzle-orm/pg-core';
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
    foreignKey({
      name: 'survival_picks_team_fk',
      columns: [table.tournamentId, table.teamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
  ],
);
