import {
  createLeague,
  ok,
  refuse,
  updateLeague,
  type CreateRefusal,
  type LeagueEdit,
  type LeagueEntry,
  type LeagueId,
  type PlayerId,
  type Result,
  type Tournament,
  type UpdateRefusal,
} from '@sportbet/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { lockPlayerStatuses } from '../player/repository';
import { leagueOf } from './list';
import { lockLeague, lockMember } from './locked';
import { leagueMembers, leagues } from './schema';

const idRows = z.array(z.object({ id: z.int() }));

/** The moment now, to the second, as an Instant is. */
const now = (): Date => new Date(Math.floor(Date.now() / 1000) * 1000);

/**
 * LeagueController::create after its form: the player founds a private league
 * in the tournament and becomes its owner and admin member, in one
 * transaction (a league whose owner is no member is one nobody can
 * administer). The membership is not selected: the player's selection stays
 * where it is. A league belongs to a tournament the player plays (no
 * tournament, or one they do not play: `no-tournament`, issue 272). The
 * player's `tournament_players` rows are locked (lockPlayerStatuses) before
 * that is checked, so an account being deleted cannot slip in between the
 * check and the rows that reference it; no league-level lock is taken, as
 * nothing exists yet to race with.
 */
export async function foundLeague(
  db: Executor,
  found: {
    readonly player: PlayerId;
    readonly entry: LeagueEntry;
    readonly tournament: Tournament | null;
  },
): Promise<Result<{ league: LeagueId }, CreateRefusal>> {
  return db.transaction(
    async (tx): Promise<Result<{ league: LeagueId }, CreateRefusal>> => {
      const playerKey = keyOf(found.player, 'player');
      const decided = createLeague({
        entry: found.entry,
        player: found.player,
        tournament: found.tournament,
        isPlayerIn: (await lockPlayerStatuses(tx, found.player)).some(
          ({ tournament }) => Number(tournament) === found.tournament?.id,
        ),
      });
      if (!decided.ok) return decided;
      const draft = decided.value;
      const [row] = idRows.parse(
        await tx
          .insert(leagues)
          .values({
            tournamentId: draft.tournament,
            name: draft.name,
            description: draft.description,
            isPublic: false,
            ownerId: playerKey,
            baseFee: draft.baseFee,
            penaltyStep: draft.penaltyStep,
            rewardDescription: draft.reward,
            createdAt: now(),
          })
          .returning({ id: leagues.id }),
      );
      if (row === undefined) {
        throw new Error('foundLeague: the insert returned no league');
      }
      await tx.insert(leagueMembers).values({
        leagueId: row.id,
        playerId: playerKey,
        isAdmin: draft.membership.isAdmin,
        isGuest: draft.membership.isGuest,
        joinedAt: now(),
      });
      return ok({ league: leagueOf(row.id) });
    },
  );
}

const editValues = (edit: LeagueEdit) => ({
  name: edit.name,
  description: edit.description,
  baseFee: edit.baseFee,
  penaltyStep: edit.penaltyStep,
});

/**
 * LeagueController::update after its form: an admin of the league changes
 * its name, description and fees (never the reward or the payment details).
 * One transaction under the lock order: the league row `FOR UPDATE`, then the
 * actor's membership `FOR SHARE`. A league that is not there is
 * `no-such-league`; both it and a non-admin are sportbet's 404.
 */
export async function editLeague(
  db: Executor,
  edit: {
    readonly player: PlayerId;
    readonly league: LeagueId;
    readonly entry: LeagueEntry;
  },
): Promise<Result<void, UpdateRefusal | 'no-such-league'>> {
  return db.transaction(
    async (tx): Promise<Result<void, UpdateRefusal | 'no-such-league'>> => {
      const locked = await lockLeague(tx, edit.league, 'update');
      if (locked === null) return refuse('no-such-league');
      const decided = updateLeague({
        league: locked.league,
        actorMember: await lockMember(tx, edit.league, edit.player, 'share'),
        entry: edit.entry,
      });
      if (!decided.ok) return decided;
      await tx
        .update(leagues)
        .set(editValues(decided.value))
        .where(eq(leagues.id, edit.league));
      return ok(undefined);
    },
  );
}
