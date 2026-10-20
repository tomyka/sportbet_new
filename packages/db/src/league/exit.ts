import {
  deleteLeague,
  leaveLeague,
  ok,
  refuse,
  transferLeague,
  type DeleteRefusal,
  type League,
  type LeagueId,
  type LeaveRefusal,
  type PlayerId,
  type Result,
  type TransferRefusal,
} from '@sportbet/domain';
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, playerOf } from '../edge';
import { lockPlayerStatuses } from '../player/repository';
import { tournamentPlayers } from '../player/schema';
import { leagueOf } from './list';
import {
  lockLeague,
  lockMember,
  lockMembers,
  type LockedLeague,
} from './locked';
import { leagueMembers, leagues, messages } from './schema';

const counted = z.tuple([z.object({ others: z.int() })]);
const idRows = z.array(z.object({ id: z.int() }));
const playerRows = z.array(z.object({ player: z.int() }));
const selectionRows = z.array(z.object({ league: z.int() }));

/**
 * The tournament's public league (publicLeagueIn, issue 267): every
 * tournament has exactly one, so none is an impossible state.
 */
async function publicLeagueOf(
  tx: Executor,
  tournament: number,
): Promise<LeagueId> {
  const [row] = idRows.parse(
    await tx
      .select({ id: leagues.id })
      .from(leagues)
      .where(
        and(eq(leagues.tournamentId, tournament), eq(leagues.isPublic, true)),
      ),
  );
  if (row === undefined) {
    throw new Error(`tournament ${String(tournament)} has no public league`);
  }
  return leagueOf(row.id);
}

/** The player's leagues other than `league`, in `tournament` (R-29). */
async function otherLeaguesOf(
  tx: Executor,
  player: PlayerId,
  league: LeagueId,
  tournament: number,
): Promise<number> {
  const [{ others }] = counted.parse(
    await tx
      .select({ others: count() })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
      .where(
        and(
          eq(leagueMembers.playerId, keyOf(player, 'player')),
          ne(leagueMembers.leagueId, league),
          eq(leagues.tournamentId, tournament),
        ),
      ),
  );
  return others;
}

/** Whether the player's selection in the tournament is the league (their rows are locked). */
async function selects(
  tx: Executor,
  player: PlayerId,
  tournament: number,
  league: LeagueId,
): Promise<boolean> {
  const rows = selectionRows.parse(
    await tx
      .select({ league: tournamentPlayers.selectedLeagueId })
      .from(tournamentPlayers)
      .where(
        and(
          eq(tournamentPlayers.playerId, keyOf(player, 'player')),
          eq(tournamentPlayers.tournamentId, tournament),
        ),
      ),
  );
  return rows.some((row) => row.league === league);
}

/** What leaveLeague needs to know of the player's other leagues and selection (their rows are locked). */
async function leaveFacts(tx: Executor, actor: PlayerId, league: LockedLeague) {
  const id = league.league.id;
  return {
    otherLeaguesInTournament: await otherLeaguesOf(
      tx,
      actor,
      id,
      league.tournament,
    ),
    selectsIt: await selects(tx, actor, league.tournament, id),
  };
}

/**
 * LeagueController::leaveLeague: the player's membership goes. One
 * transaction under the lock order: the league row `FOR SHARE`, the
 * membership `FOR UPDATE`, the player's `tournament_players` rows; then
 * `leaveLeague` decides (R-29: this tournament's other leagues). When the
 * player selected the league, the selection moves to the tournament's public
 * league first (the composite foreign key is NO ACTION, so the membership
 * cannot go while selected); `selected` is that league, or null when the
 * selection did not move. A refusal writes nothing.
 */
export async function exitLeague(
  db: Executor,
  exit: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
  },
): Promise<
  Result<{ selected: LeagueId | null }, LeaveRefusal | 'no-such-league'>
> {
  return db.transaction(
    async (
      tx,
    ): Promise<
      Result<{ selected: LeagueId | null }, LeaveRefusal | 'no-such-league'>
    > => {
      const locked = await lockLeague(tx, exit.league, 'share');
      if (locked === null) return refuse('no-such-league');
      const member = await lockMember(tx, exit.league, exit.actor, 'update');
      await lockPlayerStatuses(tx, exit.actor);
      const decided = leaveLeague({
        league: locked.league,
        actor: exit.actor,
        member,
        ...(await leaveFacts(tx, exit.actor, locked)),
      });
      if (!decided.ok) return decided;
      const selected = decided.value.selectPublic
        ? await publicLeagueOf(tx, locked.tournament)
        : null;
      if (selected !== null) {
        await tx
          .update(tournamentPlayers)
          .set({ selectedLeagueId: selected })
          .where(
            and(
              eq(tournamentPlayers.tournamentId, locked.tournament),
              eq(tournamentPlayers.playerId, keyOf(exit.actor, 'player')),
            ),
          );
      }
      await tx
        .delete(leagueMembers)
        .where(
          and(
            eq(leagueMembers.leagueId, exit.league),
            eq(leagueMembers.playerId, keyOf(exit.actor, 'player')),
          ),
        );
      return ok({ selected });
    },
  );
}

/**
 * The body of every league delete, in the caller's transaction: the league
 * row `FOR UPDATE`, its members by player, then the `tournament_players`
 * rows of every player selecting it, by player. `decide` (the owner's
 * `deleteLeague`, or the superadmin's) judges what was read; then those
 * players are moved to the tournament's public league (a selection cannot
 * point at a league that is gone), the league's messages are detached
 * (`league_id` null), and the league goes, its members and invites with it.
 * `tournament` limits it to a league of that tournament (the admin's
 * working one): any other is `no-such-league`. A refusal writes nothing.
 */
export async function deleteLeagueUnderLocks<R extends string>(
  tx: Executor,
  remove: {
    readonly league: LeagueId;
    readonly tournament: number | null;
    readonly decide: (read: {
      readonly league: League;
      readonly selectingPlayers: readonly PlayerId[];
    }) => Result<{ readonly moveToPublic: readonly PlayerId[] }, R>;
  },
): Promise<Result<void, R | 'no-such-league'>> {
  const locked = await lockLeague(tx, remove.league, 'update');
  if (
    locked === null ||
    (remove.tournament !== null && locked.tournament !== remove.tournament)
  ) {
    return refuse('no-such-league');
  }
  await lockMembers(tx, remove.league);
  const selecting = playerRows
    .parse(
      await tx
        .select({ player: tournamentPlayers.playerId })
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.selectedLeagueId, remove.league))
        .orderBy(asc(tournamentPlayers.playerId)),
    )
    .map(({ player }) => playerOf(player));
  for (const player of selecting) await lockPlayerStatuses(tx, player);
  const decided = remove.decide({
    league: locked.league,
    selectingPlayers: selecting,
  });
  if (!decided.ok) return decided;
  if (selecting.length > 0) {
    await tx
      .update(tournamentPlayers)
      .set({
        selectedLeagueId: await publicLeagueOf(tx, locked.tournament),
      })
      .where(
        and(
          eq(tournamentPlayers.tournamentId, locked.tournament),
          inArray(
            tournamentPlayers.playerId,
            decided.value.moveToPublic.map((player) => keyOf(player, 'player')),
          ),
        ),
      );
  }
  await tx
    .update(messages)
    .set({ leagueId: null })
    .where(eq(messages.leagueId, remove.league));
  await tx.delete(leagues).where(eq(leagues.id, remove.league));
  return ok(undefined);
}

/**
 * LeagueController::deleteLeague: the owner ends the league
 * (`deleteLeagueUnderLocks`, decided by `deleteLeague`).
 */
export async function removeLeague(
  db: Executor,
  remove: { readonly actor: PlayerId; readonly league: LeagueId },
): Promise<Result<void, DeleteRefusal | 'no-such-league'>> {
  return db.transaction((tx) =>
    deleteLeagueUnderLocks(tx, {
      league: remove.league,
      tournament: null,
      decide: ({ league, selectingPlayers }) =>
        deleteLeague({ league, actor: remove.actor, selectingPlayers }),
    }),
  );
}

/**
 * R-23, `/leagues/transfer`: the owner hands the league to another member,
 * who becomes its owner and an admin (R-105); the former owner's membership
 * is untouched, so they stay an admin and may then leave. One transaction
 * under the lock order: the league row `FOR UPDATE`, then the member's row.
 */
export async function handOverLeague(
  db: Executor,
  hand: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
    readonly to: PlayerId;
  },
): Promise<Result<void, TransferRefusal | 'no-such-league'>> {
  return db.transaction(
    async (tx): Promise<Result<void, TransferRefusal | 'no-such-league'>> => {
      const locked = await lockLeague(tx, hand.league, 'update');
      if (locked === null) return refuse('no-such-league');
      const decided = transferLeague({
        league: locked.league,
        actor: hand.actor,
        to: await lockMember(tx, hand.league, hand.to, 'update'),
      });
      if (!decided.ok) return decided;
      await tx
        .update(leagues)
        .set({ ownerId: keyOf(decided.value.owner, 'player') })
        .where(eq(leagues.id, hand.league));
      await tx
        .update(leagueMembers)
        .set({ isAdmin: true })
        .where(
          and(
            eq(leagueMembers.leagueId, hand.league),
            eq(leagueMembers.playerId, keyOf(decided.value.admin, 'player')),
          ),
        );
      return ok(undefined);
    },
  );
}
