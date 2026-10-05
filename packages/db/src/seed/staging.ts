import type { EmailAddress } from '@sportbet/domain';
import { playerSettings } from '../account/schema';
import type { Db } from '../client';
import { excluded } from '../edge';
import { players, tournamentPlayers } from '../player/schema';
import {
  findTournamentBySlug,
  insertTournaments,
  type NewTournament,
} from '../tournament/repository';

/** Staging's fake data. Never real players or real tournaments' results. */
export const STAGING_TOURNAMENTS: readonly NewTournament[] = [
  {
    slug: 'euroleague-2025-26',
    name: 'Euroleague 2025/26',
    format: 'euroleague',
    endsOn: '2026-05-24',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
  {
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    format: 'euroleague',
    endsOn: '2027-05-23',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
];

/**
 * The one staging account: its address comes from STAGING_ACCOUNT_EMAIL (a
 * secret; the owner's on staging, a test address in CI's E2E stack), never
 * from this file. A player, not an admin: admin tiers are slice 13's.
 */
export const STAGING_ACCOUNT = {
  username: 'savininkas',
  name: 'Savininkas',
  surname: '',
  plays: 'euroleague-2026-27',
} as const;

/**
 * Inserts the staging tournaments, and, given an address, the staging
 * account, its settings and its place in one tournament. Running it again
 * keeps one account and moves it to the address given.
 */
export async function seedStaging(
  db: Db,
  accountEmail: EmailAddress | null,
): Promise<void> {
  await insertTournaments(db, STAGING_TOURNAMENTS);
  if (accountEmail === null) return;
  await db.transaction(async (tx) => {
    const [account] = await tx
      .insert(players)
      .values({
        username: STAGING_ACCOUNT.username,
        email: accountEmail,
        name: STAGING_ACCOUNT.name,
        surname: STAGING_ACCOUNT.surname,
      })
      .onConflictDoUpdate({
        target: players.username,
        set: { email: excluded(players.email) },
      })
      .returning({ id: players.id });
    const tournament = await findTournamentBySlug(tx, STAGING_ACCOUNT.plays);
    if (account === undefined || tournament === undefined) {
      throw new Error('seed: the staging account or its tournament is missing');
    }
    await tx
      .insert(playerSettings)
      .values({ playerId: account.id })
      .onConflictDoNothing({ target: playerSettings.playerId });
    await tx
      .insert(tournamentPlayers)
      .values({
        tournamentId: tournament.id,
        playerId: account.id,
        switchedOff: false,
        fillIns: 0,
      })
      .onConflictDoNothing({
        target: [tournamentPlayers.tournamentId, tournamentPlayers.playerId],
      });
  });
}
