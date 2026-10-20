import {
  adminHideChange,
  isSuperadmin,
  ok,
  refuse,
  type PlayerId,
  type Result,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { BOARD_CHANGED, type BoardEffect } from '../board-effect';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { lockRoleShared } from '../account/superadmins';
import { saveTransaction } from '../save-transaction';
import { lockPlayerStatuses } from './repository';
import { tournamentPlayers } from './schema';

export type AdminHideRefusal = 'actor-not-superadmin' | 'not-player';

/** The state setAdminHidden left, and that the tables' listing changed. */
export interface AdminHidden extends BoardEffect {
  readonly hidden: boolean;
}

/**
 * R-19, R-39, R-115: an admin's hide of a player, in the one tournament the
 * admin works on - the button hides, the same button un-hides. One
 * transaction waiting at most 5 s for any lock: the actor's role is read
 * under a shared lock first (a superadmin demoted meanwhile is refused),
 * then the player's `tournament_players` rows through `lockPlayerStatuses`.
 * `adminHideChange` sets `admin_hidden` and nothing else: the switch-off
 * (R-7) and the fill-in count stay, and the player keeps getting fill-ins
 * (R-39). A player who does not play the tournament is `not-player`
 * (their other tournaments' rows are never touched). No recalculation: a
 * hidden player keeps their points, only the tables stop listing them -
 * the answer says the board changed (BoardEffect). Answers the state it left.
 */
export async function setAdminHidden(
  db: Executor,
  write: {
    readonly actor: PlayerId;
    readonly tournament: Tournament;
    readonly player: PlayerId;
  },
): Promise<Result<AdminHidden, AdminHideRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<AdminHidden, AdminHideRefusal>> => {
      const role = await lockRoleShared(tx, write.actor);
      if (role === null || !isSuperadmin(role)) {
        return refuse('actor-not-superadmin');
      }
      const rows = await lockPlayerStatuses(tx, write.player);
      const row = rows.find(
        (each) => Number(each.tournament) === write.tournament.id,
      );
      if (row === undefined) return refuse('not-player');
      const changed = adminHideChange(row, !row.adminHidden);
      await tx
        .update(tournamentPlayers)
        .set({ adminHidden: changed.adminHidden })
        .where(
          and(
            eq(tournamentPlayers.tournamentId, write.tournament.id),
            eq(tournamentPlayers.playerId, keyOf(write.player, 'player')),
          ),
        );
      return ok({ hidden: changed.adminHidden, ...BOARD_CHANGED });
    },
  );
}
