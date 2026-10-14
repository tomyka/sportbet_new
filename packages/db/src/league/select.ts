import {
  ok,
  refuse,
  tournamentId,
  type LeagueId,
  type PlayerId,
  type Result,
  type TournamentId,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, stored } from '../edge';
import { lockPlayerStatuses } from '../player/repository';
import { tournamentPlayers } from '../player/schema';
import { leagueMembers, leagues } from './schema';

export type SelectRefusal = 'not-a-member';

const membershipRows = z.array(z.object({ tournament: z.int() }));

/**
 * LeagueController::switchLeague: the player's selection in the league's
 * tournament moves to the league. One transaction, under the lock order
 * (lock.ts): the membership row FOR SHARE (it must exist, else sportbet's
 * 404: `not-a-member`; so does a player who plays no part in the league's
 * tournament, who cannot select a league there), then the player's
 * `tournament_players` rows through `lockPlayerStatuses`, then the update.
 * No tournament lock and no recalculation: a selection changes no points.
 * Which league a table shows is read through `loadRoster`.
 */
export async function selectLeague(
  db: Executor,
  select: { readonly player: PlayerId; readonly league: LeagueId },
): Promise<Result<{ tournament: TournamentId }, SelectRefusal>> {
  const playerKey = keyOf(select.player, 'player');
  return db.transaction(
    async (
      tx,
    ): Promise<Result<{ tournament: TournamentId }, SelectRefusal>> => {
      const [membership] = membershipRows.parse(
        await tx
          .select({ tournament: leagues.tournamentId })
          .from(leagueMembers)
          .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
          .where(
            and(
              eq(leagueMembers.leagueId, select.league),
              eq(leagueMembers.playerId, playerKey),
            ),
          )
          .for('share', { of: leagueMembers }),
      );
      if (membership === undefined) return refuse('not-a-member');
      await lockPlayerStatuses(tx, select.player);
      const moved = await tx
        .update(tournamentPlayers)
        .set({ selectedLeagueId: select.league })
        .where(
          and(
            eq(tournamentPlayers.tournamentId, membership.tournament),
            eq(tournamentPlayers.playerId, playerKey),
          ),
        )
        .returning({ player: tournamentPlayers.playerId });
      if (moved.length === 0) return refuse('not-a-member');
      return ok({
        tournament: stored(
          tournamentId(String(membership.tournament)),
          'leagues',
          select.league,
        ),
      });
    },
  );
}
