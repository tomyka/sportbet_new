import {
  leagueNameInvariant,
  storedLeagueInvite,
  storedLeagueMessage,
  type Instant,
  type League,
  type LeagueId,
  type LeagueInvite,
  type LeagueMessage,
  type PlayerId,
  type Tournament,
} from '@sportbet/domain';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { excluded, inChunks, keyOf, keyOfTournament, stored } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { leagueOf, type SavedLeague } from './list';
import { leagueInvites, leagueMembers, leagues, messages } from './schema';

/** A league name cut to what its column holds, in characters. */
const nameCut = (name: string): string =>
  Array.from(name).slice(0, leagueNameInvariant.maxLength).join('');

const date = (instant: Instant | null): Date | null =>
  instant === null ? null : new Date(instant);

/** The moment now, to the second, as an Instant is. */
const now = (): Date => new Date(Math.floor(Date.now() / 1000) * 1000);

const idRows = z.array(z.object({ id: z.int() }));

/**
 * The tournament's public league, created (named after the tournament,
 * with a generated id) when it has none: every tournament has exactly one,
 * and every writer of a tournament's players needs it; sportbet's
 * TournamentRegistrationService::register does the same firstOrCreate.
 * The reader saves the public league under sportbet's id first
 * (saveLeagues), so it is found, never duplicated. Safe against a
 * concurrent creator: the partial unique index decides, and the loser reads
 * the winner's row.
 */
export async function ensurePublicLeague(
  tx: Executor,
  tournament: Tournament,
): Promise<LeagueId> {
  await tx
    .insert(leagues)
    .values({
      tournamentId: tournament.id,
      name: nameCut(tournament.name),
      isPublic: true,
      createdAt: now(),
    })
    .onConflictDoNothing({
      target: leagues.tournamentId,
      where: sql`${leagues.isPublic}`,
    });
  const [found] = idRows.parse(
    await tx
      .select({ id: leagues.id })
      .from(leagues)
      .where(
        and(
          eq(leagues.tournamentId, tournament.id),
          eq(leagues.isPublic, true),
        ),
      ),
  );
  if (found === undefined) {
    throw new Error(
      `tournament ${String(tournament.id)} has no public league after creating it`,
    );
  }
  return leagueOf(found.id);
}

/**
 * Puts the players in the tournament's public league (creating it, as
 * ensurePublicLeague does) where they are not yet, and returns it: what
 * every writer of `tournament_players` does first, so each new row can
 * select it.
 */
export async function joinPublicLeague(
  tx: Executor,
  tournament: Tournament,
  players: readonly PlayerId[],
): Promise<LeagueId> {
  const league = await ensurePublicLeague(tx, tournament);
  await inChunks(players, (chunk) =>
    tx
      .insert(leagueMembers)
      .values(
        chunk.map((player) => ({
          leagueId: league,
          playerId: keyOf(player, 'player'),
          joinedAt: now(),
        })),
      )
      .onConflictDoNothing({
        target: [leagueMembers.leagueId, leagueMembers.playerId],
      }),
  );
  return league;
}

function assertOfTournament(league: League, tournament: Tournament): void {
  if (league.tournament !== keyOfTournament(tournament)) {
    throw new Error(
      `saveLeagues: league ${String(league.id)} belongs to another tournament than ${String(tournament.id)}`,
    );
  }
}

function leagueValues(league: League, tournament: Tournament) {
  return {
    id: league.id,
    tournamentId: tournament.id,
    name: league.name,
    description: league.description,
    isPublic: league.kind.public,
    ownerId:
      league.kind.public || league.kind.owner === null
        ? null
        : keyOf(league.kind.owner, 'player'),
    baseFee: league.fee.base,
    penaltyStep: league.fee.penaltyStep,
    rewardDescription: league.fee.reward,
    paymentBeneficiary: league.payment.beneficiary,
    paymentIban: league.payment.iban,
    paymentNote: league.payment.note,
    createdAt: date(league.createdAt),
  };
}

/**
 * Upserts the tournament's leagues by id (`overridingSystemValue`: the
 * reader keeps sportbet's ids; call `advanceIdentitySequences` after), then
 * their members by id. A member's player must exist; a league of another
 * tournament is a programmer error.
 */
export async function saveLeagues(
  db: Executor,
  tournament: Tournament,
  saved: readonly SavedLeague[],
): Promise<void> {
  for (const { league } of saved) assertOfTournament(league, tournament);
  await inChunks(saved, (chunk) =>
    db
      .insert(leagues)
      .overridingSystemValue()
      .values(chunk.map(({ league }) => leagueValues(league, tournament)))
      .onConflictDoUpdate({
        target: leagues.id,
        set: {
          name: excluded(leagues.name),
          description: excluded(leagues.description),
          isPublic: excluded(leagues.isPublic),
          ownerId: excluded(leagues.ownerId),
          baseFee: excluded(leagues.baseFee),
          penaltyStep: excluded(leagues.penaltyStep),
          rewardDescription: excluded(leagues.rewardDescription),
          paymentBeneficiary: excluded(leagues.paymentBeneficiary),
          paymentIban: excluded(leagues.paymentIban),
          paymentNote: excluded(leagues.paymentNote),
          createdAt: excluded(leagues.createdAt),
        },
      }),
  );
  await inChunks(
    saved.flatMap(({ members }) => members),
    (chunk) =>
      db
        .insert(leagueMembers)
        .overridingSystemValue()
        .values(
          chunk.map((member) => ({
            id: member.id,
            leagueId: member.league,
            playerId: keyOf(member.player, 'player'),
            isAdmin: member.isAdmin,
            isGuest: member.isGuest,
            paidCents: member.paid,
            joinedAt: date(member.joinedAt),
          })),
        )
        .onConflictDoUpdate({
          target: leagueMembers.id,
          set: {
            leagueId: excluded(leagueMembers.leagueId),
            playerId: excluded(leagueMembers.playerId),
            isAdmin: excluded(leagueMembers.isAdmin),
            isGuest: excluded(leagueMembers.isGuest),
            paidCents: excluded(leagueMembers.paidCents),
            joinedAt: excluded(leagueMembers.joinedAt),
          },
        }),
  );
}

/**
 * The selections written after the players (the reader): each player's
 * `selected_league_id` in this tournament. A player who plays no part in it
 * is a programmer error.
 */
export async function saveLeagueSelections(
  db: Executor,
  tournament: Tournament,
  selections: ReadonlyMap<PlayerId, LeagueId>,
): Promise<void> {
  await inChunks([...selections], async (chunk) => {
    const updated = await db
      .update(tournamentPlayers)
      .set({ selectedLeagueId: sql`chosen.league` })
      .from(
        sql`(values ${sql.join(
          chunk.map(
            ([player, league]) =>
              sql`(${keyOf(player, 'player')}::integer, ${league}::integer)`,
          ),
          sql`, `,
        )}) as chosen(player, league)`,
      )
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournament.id),
          sql`${tournamentPlayers.playerId} = chosen.player`,
        ),
      )
      .returning({ player: tournamentPlayers.playerId });
    const done = new Set(updated.map(({ player }) => player));
    for (const [player] of chunk) {
      if (!done.has(keyOf(player, 'player'))) {
        throw new Error(
          `saveLeagueSelections: player ${player} is not in tournament ${String(tournament.id)}`,
        );
      }
    }
  });
}

/** Upserts pending invites by id (`overridingSystemValue`; the reader). */
export async function saveInvites(
  db: Executor,
  saved: readonly LeagueInvite[],
): Promise<void> {
  for (const invite of saved) {
    stored(storedLeagueInvite(invite), 'league_invites', invite.id);
  }
  await inChunks(saved, (chunk) =>
    db
      .insert(leagueInvites)
      .overridingSystemValue()
      .values(
        chunk.map((invite) => ({
          id: invite.id,
          leagueId: invite.league,
          inviteeId: keyOf(invite.invitee, 'player'),
          invitedById:
            invite.invitedBy === null
              ? null
              : keyOf(invite.invitedBy, 'player'),
          createdAt: date(invite.createdAt),
        })),
      )
      .onConflictDoUpdate({
        target: leagueInvites.id,
        set: {
          leagueId: excluded(leagueInvites.leagueId),
          inviteeId: excluded(leagueInvites.inviteeId),
          invitedById: excluded(leagueInvites.invitedById),
          createdAt: excluded(leagueInvites.createdAt),
        },
      }),
  );
}

/** Upserts messages by id (`overridingSystemValue`; the reader). */
export async function saveMessages(
  db: Executor,
  saved: readonly LeagueMessage[],
): Promise<void> {
  for (const message of saved) {
    stored(storedLeagueMessage(message), 'messages', message.id);
  }
  await inChunks(saved, (chunk) =>
    db
      .insert(messages)
      .overridingSystemValue()
      .values(
        chunk.map((message) => ({
          id: message.id,
          leagueId: message.league,
          text: message.text,
          active: message.active,
        })),
      )
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          leagueId: excluded(messages.leagueId),
          text: excluded(messages.text),
          active: excluded(messages.active),
        },
      }),
  );
}
