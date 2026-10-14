import {
  cents,
  leagueFeeInvariant,
  leagueId,
  leagueNameInvariant,
  paidCentsInvariant,
  paymentBeneficiaryInvariant,
  paymentIbanInvariant,
  storedLeague,
  storedLeagueMember,
  type League,
  type LeagueId,
  type LeagueMember,
  type PlayerId,
  type Tournament,
} from '@sportbet/domain';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { instantOf, keyOf, keyOfTournament, playerOf, stored } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { leagueInvites, leagueMembers, leagues } from './schema';

/** A league with its members, as the reader and the seed save it. */
export interface SavedLeague {
  readonly league: League;
  readonly members: readonly LeagueMember[];
}

/** One of a player's leagues in a tournament, as the switcher lists it. */
export interface PlayerLeague {
  readonly id: LeagueId;
  readonly name: string;
  readonly isPublic: boolean;
  /** The player's own level in it (R-87). */
  readonly isGuest: boolean;
  /** The league the player's tables show (`tournament_players.selected_league_id`). */
  readonly selected: boolean;
}

export const leagueOf = (id: number): LeagueId =>
  stored(leagueId(id), 'leagues', id);

const leagueRows = z.array(
  z.object({
    id: z.int(),
    name: leagueNameInvariant.schema,
    description: z.string().nullable(),
    isPublic: z.boolean(),
    ownerId: z.int().nullable(),
    baseFee: leagueFeeInvariant.schema.nullable(),
    penaltyStep: leagueFeeInvariant.schema.nullable(),
    reward: z.string().nullable(),
    beneficiary: paymentBeneficiaryInvariant.schema.nullable(),
    iban: paymentIbanInvariant.schema.nullable(),
    note: z.string().nullable(),
    createdAt: z.date().nullable(),
  }),
);

const memberRows = z.array(
  z.object({
    id: z.int(),
    leagueId: z.int(),
    playerId: z.int(),
    isAdmin: z.boolean(),
    isGuest: z.boolean(),
    paidCents: paidCentsInvariant.schema.nullable(),
    joinedAt: z.date().nullable(),
  }),
);

/**
 * A stored timestamp as an instant: to the second, truncated, since a row
 * written by SQL (now()) carries fractions an Instant does not.
 */
const instantOrNull = (value: Date | null, table: string, key: number) =>
  value === null
    ? null
    : instantOf(
        new Date(Math.floor(value.getTime() / 1000) * 1000),
        table,
        String(key),
      );

type LeagueRow = z.infer<typeof leagueRows>[number];
type MemberRow = z.infer<typeof memberRows>[number];

function readLeague(row: LeagueRow, tournament: Tournament): League {
  return stored(
    storedLeague({
      id: leagueOf(row.id),
      tournament: keyOfTournament(tournament),
      name: row.name,
      description: row.description,
      kind: row.isPublic
        ? { public: true }
        : {
            public: false,
            owner: row.ownerId === null ? null : playerOf(row.ownerId),
          },
      fee: {
        base: row.baseFee,
        penaltyStep: row.penaltyStep,
        reward: row.reward,
      },
      payment: {
        beneficiary: row.beneficiary,
        iban: row.iban,
        note: row.note,
      },
      createdAt: instantOrNull(row.createdAt, 'leagues', row.id),
    }),
    'leagues',
    row.id,
  );
}

function readMember(row: MemberRow): LeagueMember {
  return stored(
    storedLeagueMember({
      id: row.id,
      league: leagueOf(row.leagueId),
      player: playerOf(row.playerId),
      isAdmin: row.isAdmin,
      isGuest: row.isGuest,
      paid:
        row.paidCents === null
          ? null
          : stored(cents(row.paidCents), 'league_members', row.id),
      joinedAt: instantOrNull(row.joinedAt, 'league_members', row.id),
    }),
    'league_members',
    row.id,
  );
}

/** Every league of the tournament with its members, by id. */
export async function listLeagues(
  db: Executor,
  tournament: Tournament,
): Promise<SavedLeague[]> {
  const rows = leagueRows.parse(
    await db
      .select({
        id: leagues.id,
        name: leagues.name,
        description: leagues.description,
        isPublic: leagues.isPublic,
        ownerId: leagues.ownerId,
        baseFee: leagues.baseFee,
        penaltyStep: leagues.penaltyStep,
        reward: leagues.rewardDescription,
        beneficiary: leagues.paymentBeneficiary,
        iban: leagues.paymentIban,
        note: leagues.paymentNote,
        createdAt: leagues.createdAt,
      })
      .from(leagues)
      .where(eq(leagues.tournamentId, tournament.id))
      .orderBy(asc(leagues.id)),
  );
  const members = memberRows.parse(
    await db
      .select({
        id: leagueMembers.id,
        leagueId: leagueMembers.leagueId,
        playerId: leagueMembers.playerId,
        isAdmin: leagueMembers.isAdmin,
        isGuest: leagueMembers.isGuest,
        paidCents: leagueMembers.paidCents,
        joinedAt: leagueMembers.joinedAt,
      })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
      .where(eq(leagues.tournamentId, tournament.id))
      .orderBy(asc(leagueMembers.id)),
  );
  return rows.map((row) => ({
    league: readLeague(row, tournament),
    members: members
      .filter((member) => member.leagueId === row.id)
      .map(readMember),
  }));
}

const playerLeagueRows = z.array(
  z.object({
    id: z.int(),
    name: leagueNameInvariant.schema,
    isPublic: z.boolean(),
    isGuest: z.boolean(),
    selected: z.boolean(),
  }),
);

/**
 * The player's leagues in the tournament, in membership order (sportbet's
 * switcher lists `LeagueMember::get()`, which is by member id), the selected
 * one marked.
 */
export async function loadPlayerLeagues(
  db: Executor,
  tournament: Tournament,
  player: PlayerId,
): Promise<readonly PlayerLeague[]> {
  const rows = playerLeagueRows.parse(
    await db
      .select({
        id: leagues.id,
        name: leagues.name,
        isPublic: leagues.isPublic,
        isGuest: leagueMembers.isGuest,
        selected: sql<boolean>`coalesce(${tournamentPlayers.selectedLeagueId} = ${leagues.id}, false)`,
      })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
      .leftJoin(
        tournamentPlayers,
        and(
          eq(tournamentPlayers.tournamentId, leagues.tournamentId),
          eq(tournamentPlayers.playerId, leagueMembers.playerId),
        ),
      )
      .where(
        and(
          eq(leagueMembers.playerId, keyOf(player, 'player')),
          eq(leagues.tournamentId, tournament.id),
        ),
      )
      .orderBy(asc(leagueMembers.id)),
  );
  return rows.map((row) => ({ ...row, id: leagueOf(row.id) }));
}

const counted = z.tuple([z.object({ invites: z.int() })]);

/**
 * LeagueInvite::pendingCountFor: the invites waiting for the player in every
 * tournament, on purpose (issue 183).
 */
export async function countPendingInvites(
  db: Executor,
  player: PlayerId,
): Promise<number> {
  const [{ invites }] = counted.parse(
    await db
      .select({ invites: count() })
      .from(leagueInvites)
      .where(eq(leagueInvites.inviteeId, keyOf(player, 'player'))),
  );
  return invites;
}
