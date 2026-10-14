import {
  emailAddress,
  leagueId,
  type LeagueMember,
  type PlayerId,
  type StoredPlayer,
  type Tournament,
} from '@sportbet/domain';
import { savePlayerSettings } from '../account/repository';
import { and, eq } from 'drizzle-orm';
import type { Executor } from '../client';
import { keyOfTournament, playerOf, stored } from '../edge';
import { advanceIdentitySequences } from '../identity';
import { saveLeagueSelections, saveLeagues } from '../league/repository';
import { leagues } from '../league/schema';
import { savePlayers, saveTournamentPlayers } from '../player/repository';

// The staging seed's leagues (#29): what the league switcher and the
// narrowed tables are seen on.

/** The ids of the staging leagues, members and players: fixed, so a rerun finds them. */
export const STAGING_LEAGUES = {
  publicId: stored(leagueId(9001), 'leagues', 9001),
  privateId: stored(leagueId(9002), 'leagues', 9002),
  privateName: 'Draugų lyga',
  /** A full member of the private league. */
  member: { id: 9101, username: 'zaidejas' },
  /** A guest of the private league (R-87). */
  guest: { id: 9102, username: 'svecias' },
} as const;

const NO_PAYMENT = { beneficiary: null, iban: null, note: null } as const;
const NO_FEE = { base: null, penaltyStep: null, reward: null } as const;

/**
 * The tournament's public league, before anyone joins: the one it has - a
 * migration (0018) or the reader may have made it under a generated or
 * sportbet's id, and a tournament has only one - else a new one under the
 * fixed id (saveLeagues). Everything after finds it by tournament, never by
 * the constant.
 */
export async function seedPublicLeague(
  tx: Executor,
  tournament: Tournament,
): Promise<void> {
  const existing = await tx
    .select({ id: leagues.id })
    .from(leagues)
    .where(
      and(eq(leagues.tournamentId, tournament.id), eq(leagues.isPublic, true)),
    );
  if (existing.length > 0) return;
  await saveLeagues(tx, tournament, [
    {
      league: {
        id: STAGING_LEAGUES.publicId,
        tournament: keyOfTournament(tournament),
        name: tournament.name,
        description: null,
        kind: { public: true },
        fee: NO_FEE,
        payment: NO_PAYMENT,
        createdAt: null,
      },
      members: [],
    },
  ]);
  await advanceIdentitySequences(tx);
}

/**
 * A private league owned by the staging account, with one seeded player a
 * full member and one a guest, the owner selecting it: what the league
 * switcher and the narrowed tables are seen on (#29).
 */
export async function seedPrivateLeague(
  tx: Executor,
  tournament: Tournament,
  owner: PlayerId,
): Promise<void> {
  await seatSeededPlayers(tx, tournament);
  await saveStagingLeague(tx, tournament, owner);
}

/** The two seeded players, with their settings, playing the tournament. */
async function seatSeededPlayers(
  tx: Executor,
  tournament: Tournament,
): Promise<void> {
  const { member, guest } = STAGING_LEAGUES;
  const seeded = [member, guest].map(({ id, username }) =>
    testAccount(id, username),
  );
  await savePlayers(tx, seeded);
  await savePlayerSettings(
    tx,
    seeded.map(({ id }) => ({
      player: id,
      locale: 'lt',
      role: 'player' as const,
      lastTournament: null,
    })),
  );
  await saveTournamentPlayers(
    tx,
    tournament,
    seeded.map(({ id }) => ({
      player: id,
      switchedOff: false,
      adminHidden: false,
      fillIns: 0,
    })),
  );
}

/** The private league with its members, and the owner selecting it. */
async function saveStagingLeague(
  tx: Executor,
  tournament: Tournament,
  owner: PlayerId,
): Promise<void> {
  const { member, guest } = STAGING_LEAGUES;
  const at = (
    id: number,
    player: PlayerId,
    options: Partial<LeagueMember>,
  ) => ({
    id,
    league: STAGING_LEAGUES.privateId,
    player,
    isAdmin: false,
    isGuest: false,
    paid: null,
    joinedAt: null,
    ...options,
  });
  await saveLeagues(tx, tournament, [
    {
      league: {
        id: STAGING_LEAGUES.privateId,
        tournament: keyOfTournament(tournament),
        name: STAGING_LEAGUES.privateName,
        description: null,
        kind: { public: false, owner },
        fee: NO_FEE,
        payment: NO_PAYMENT,
        createdAt: null,
      },
      members: [
        at(9101, owner, { isAdmin: true }),
        at(9102, playerOf(member.id), {}),
        at(9103, playerOf(guest.id), { isGuest: true }),
      ],
    },
  ]);
  await advanceIdentitySequences(tx);
  await saveLeagueSelections(
    tx,
    tournament,
    new Map([[owner, STAGING_LEAGUES.privateId]]),
  );
}

/** A seeded player's account: an address nothing can receive at. */
function testAccount(id: number, username: string): StoredPlayer {
  const email = emailAddress(`${username}@example.invalid`);
  if (!email.ok) throw new Error('seed: a seeded address is refused');
  return {
    id: playerOf(id),
    username,
    email: email.value,
    name: username,
    surname: '',
  };
}
