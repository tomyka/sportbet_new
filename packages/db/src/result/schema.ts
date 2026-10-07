import { scoreSideInvariant } from '@sportbet/domain';
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  timestamp,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { players } from '../player/schema';
import { games } from '../season/schema';

/**
 * R-69: each accepted result change (saveResult) - who saved it, the game,
 * its state before and after (scores, or none; postponed or not, R-63),
 * when. For the superadmin to check; sportbet records nothing. It outlives
 * the saver's account: deleting it forgets only who made the change (R-69
 * amended - unlike a player's own history, R-25). Not copied from
 * production, so it starts empty at switch-over; no IP is kept (R-45).
 */
export const auditResults = pgTable(
  'audit_results',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** Who saved the result: the session's player; null once their account is deleted. */
    playerId: integer('player_id'),
    gameId: integer('game_id').notNull(),
    oldHome: smallint('old_home'),
    oldAway: smallint('old_away'),
    oldPostponed: boolean('old_postponed').notNull(),
    newHome: smallint('new_home'),
    newAway: smallint('new_away'),
    newPostponed: boolean('new_postponed').notNull(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'audit_results_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'audit_results_game_fk',
      columns: [table.gameId],
      foreignColumns: [games.id],
    }).onDelete('restrict'),
    index('audit_results_player_idx').on(table.playerId),
    index('audit_results_game_idx').on(table.gameId),
    ...auditResultInvariantChecks.map(invariantCheck),
  ],
);

/** Every invariant CHECK on `audit_results`: each score side a score. */
export const auditResultInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'audit_results_old_home_not_negative',
    column: auditResults.oldHome,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'audit_results_old_away_not_negative',
    column: auditResults.oldAway,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'audit_results_new_home_not_negative',
    column: auditResults.newHome,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'audit_results_new_away_not_negative',
    column: auditResults.newAway,
    invariant: scoreSideInvariant,
  },
];
