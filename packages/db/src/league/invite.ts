import {
  acceptInvite,
  declineInvite,
  inviteToLeague,
  ok,
  refuse,
  type AcceptRefusal,
  type InviteRefusal,
  type LeagueId,
  type LeagueInvite,
  type PlayerId,
  type Result,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { lockPlayerStatuses } from '../player/repository';
import { tournamentPlayers } from '../player/schema';
import {
  leagueOfInvite,
  lockInvite,
  lockLeague,
  lockMember,
  type LockedLeague,
} from './locked';
import { leagueInvites, leagueMembers } from './schema';

/** The moment now, to the second, as an Instant is. */
const now = (): Date => new Date(Math.floor(Date.now() / 1000) * 1000);

const existsRows = z.array(z.unknown());

async function exists(query: PromiseLike<unknown>): Promise<boolean> {
  return existsRows.parse(await query).length > 0;
}

/** What inviteToLeague needs to know of the invitee, read unlocked. */
async function inviteeFacts(
  tx: Executor,
  league: LockedLeague,
  invitee: PlayerId,
) {
  const key = keyOf(invitee, 'player');
  return {
    inviteeIsMember: await exists(
      tx
        .select({ id: leagueMembers.id })
        .from(leagueMembers)
        .where(
          and(
            eq(leagueMembers.leagueId, league.league.id),
            eq(leagueMembers.playerId, key),
          ),
        ),
    ),
    inviteeHasInvite: await exists(
      tx
        .select({ id: leagueInvites.id })
        .from(leagueInvites)
        .where(
          and(
            eq(leagueInvites.leagueId, league.league.id),
            eq(leagueInvites.inviteeId, key),
          ),
        ),
    ),
    inviteeInTournament: await exists(
      tx
        .select({ id: tournamentPlayers.playerId })
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, league.tournament),
            eq(tournamentPlayers.playerId, key),
          ),
        ),
    ),
  };
}

/**
 * LeagueController::invite after its ids: an admin invites a player to the
 * league. One transaction, the league row `FOR UPDATE` then the actor's
 * membership; the invitee's rows are read unlocked (accepting checks R-20
 * again, under the lock). The refusals are inviteToLeague's, in its order;
 * an invitee that is no account has no tournament, so R-20 refuses it (where
 * sportbet would 500 on the foreign key). The league row's lock makes two
 * invites to one player take turns, so the second finds the first and is
 * `already-member-or-invited`; unique (league, invitee) is the backstop.
 */
export async function sendLeagueInvite(
  db: Executor,
  send: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
    readonly invitee: PlayerId;
  },
): Promise<Result<void, InviteRefusal | 'no-such-league'>> {
  return db.transaction(
    async (tx): Promise<Result<void, InviteRefusal | 'no-such-league'>> => {
      const locked = await lockLeague(tx, send.league, 'update');
      if (locked === null) return refuse('no-such-league');
      const decided = inviteToLeague({
        league: locked.league,
        actorMember: await lockMember(tx, send.league, send.actor, 'share'),
        invitee: send.invitee,
        ...(await inviteeFacts(tx, locked, send.invitee)),
      });
      if (!decided.ok) return decided;
      await tx.insert(leagueInvites).values({
        leagueId: send.league,
        inviteeId: keyOf(send.invitee, 'player'),
        invitedById: keyOf(decided.value.invitedBy, 'player'),
        createdAt: now(),
      });
      return ok(undefined);
    },
  );
}

/**
 * The invite and its league, locked in the lock order: the league row (found
 * from the invite unlocked), then the invite row. Null when the invite, or
 * its league, is gone.
 */
async function lockInviteAndLeague(
  tx: Executor,
  invite: number,
  mode: 'update' | 'share',
): Promise<{ invite: LeagueInvite; league: LockedLeague } | null> {
  const leagueId = await leagueOfInvite(tx, invite);
  if (leagueId === null) return null;
  const league = await lockLeague(tx, leagueId, mode);
  const locked = await lockInvite(tx, invite);
  return league === null || locked === null ? null : { invite: locked, league };
}

/**
 * LeagueController::acceptInvite: the invitee becomes a plain member of the
 * league and the invite goes. One transaction: the league row `FOR UPDATE`,
 * the invite row, then the invitee's `tournament_players` rows
 * (lockPlayerStatuses) before R-20 is checked again, so an account being
 * deleted cannot slip in. A refusal for R-20 leaves the invite pending (the
 * player may join the tournament and then accept). The membership is not
 * selected.
 */
export async function joinFromInvite(
  db: Executor,
  join: { readonly actor: PlayerId; readonly invite: number },
): Promise<Result<{ league: LeagueId }, AcceptRefusal>> {
  return db.transaction(
    async (tx): Promise<Result<{ league: LeagueId }, AcceptRefusal>> => {
      const found = await lockInviteAndLeague(tx, join.invite, 'update');
      if (found === null) return refuse('not-your-invite');
      const statuses = await lockPlayerStatuses(tx, join.actor);
      const decided = acceptInvite({
        invite: found.invite,
        actor: join.actor,
        inTournament: statuses.some(
          ({ tournament }) => Number(tournament) === found.league.tournament,
        ),
      });
      if (!decided.ok) return decided;
      await tx
        .insert(leagueMembers)
        .values({
          leagueId: found.league.league.id,
          playerId: keyOf(join.actor, 'player'),
          isAdmin: decided.value.membership.isAdmin,
          isGuest: decided.value.membership.isGuest,
          joinedAt: now(),
        })
        .onConflictDoNothing({
          target: [leagueMembers.leagueId, leagueMembers.playerId],
        });
      await tx
        .delete(leagueInvites)
        .where(eq(leagueInvites.id, found.invite.id));
      return ok({ league: found.league.league.id });
    },
  );
}

/**
 * LeagueController::declineInvite: the invitee's own invite is deleted. The
 * league row is taken first (`FOR SHARE`: only the invite goes), as every
 * league writer does.
 */
export async function dropLeagueInvite(
  db: Executor,
  drop: { readonly actor: PlayerId; readonly invite: number },
): Promise<Result<void, 'not-your-invite'>> {
  return db.transaction(
    async (tx): Promise<Result<void, 'not-your-invite'>> => {
      const found = await lockInviteAndLeague(tx, drop.invite, 'share');
      if (found === null) return refuse('not-your-invite');
      const decided = declineInvite({
        invite: found.invite,
        actor: drop.actor,
      });
      if (!decided.ok) return decided;
      await tx
        .delete(leagueInvites)
        .where(eq(leagueInvites.id, found.invite.id));
      return ok(undefined);
    },
  );
}
