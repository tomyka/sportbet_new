import { fillInCountInvariant } from '@sportbet/domain';
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { leagueMembers, leagues } from '../league/schema';
import { tournaments } from '../tournament/schema';
import { players } from './players';

export { players, playerInvariantChecks } from './players';

/** Who plays a tournament, and the status scoring needs there (R-7, R-19). */
export const tournamentPlayers = pgTable(
  'tournament_players',
  {
    tournamentId: integer('tournament_id').notNull(),
    playerId: integer('player_id').notNull(),
    /** R-7's per-tournament switch; sportbet's one `user_settings.active`. */
    switchedOff: boolean('switched_off').notNull(),
    /** R-19; always false from sportbet, which cannot store a separate hide. */
    adminHidden: boolean('admin_hidden').notNull().default(false),
    /** The fill-ins counted toward switching off, in this tournament. */
    fillIns: integer('fill_ins').notNull(),
    /**
     * The league the player's tables show in this tournament (sportbet's
     * `league_members.active`, one per player and tournament, here
     * structurally). Moved only by `selectLeague`.
     */
    selectedLeagueId: integer('selected_league_id').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'tournament_players_pk',
      columns: [table.tournamentId, table.playerId],
    }),
    foreignKey({
      name: 'tournament_players_tournament_fk',
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'tournament_players_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    // Selected implies a member, and of a league of this tournament. NO
    // ACTION, not RESTRICT: an account deletion's cascades remove the
    // membership and this row in one statement, while removing a selected
    // membership alone still fails.
    foreignKey({
      name: 'tournament_players_player_league_fk',
      columns: [table.selectedLeagueId, table.playerId],
      foreignColumns: [leagueMembers.leagueId, leagueMembers.playerId],
    }),
    foreignKey({
      name: 'tournament_players_tournament_league_fk',
      columns: [table.selectedLeagueId, table.tournamentId],
      foreignColumns: [leagues.id, leagues.tournamentId],
    }),
    // loadPlayerStatuses reads every tournament of the tournament's players.
    index('tournament_players_player_idx').on(table.playerId),
    ...tournamentPlayerInvariantChecks.map(invariantCheck),
  ],
);

/** Every CHECK on `tournament_players`: each holds a domain invariant. */
export const tournamentPlayerInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'tournament_players_fill_ins_not_negative',
    column: tournamentPlayers.fillIns,
    invariant: fillInCountInvariant,
  },
];
