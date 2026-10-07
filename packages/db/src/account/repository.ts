import {
  localeInvariant,
  ROLES,
  storedEmailAddress,
  type EmailAddress,
  type PlayerId,
  type StoredPlayerSettings,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { excluded, inChunks, keyOf, playerOf, stored } from '../edge';
import { players, tournamentPlayers } from '../player/schema';
import { playerSettings } from './schema';

/** An account as sign-in finds it: the player, and the address exactly as stored. */
export interface Account {
  readonly player: PlayerId;
  readonly email: EmailAddress;
}

const accountRows = z.array(z.object({ id: z.int(), email: z.string() }));

const settingsRows = z.array(
  z.object({
    player: z.int(),
    locale: localeInvariant.schema,
    role: z.enum(ROLES),
    lastTournament: z.int().nullable(),
  }),
);

/**
 * The account whose address is exactly `email` (EmailIdentity::firstMatching,
 * #41): equality on the stored, normalized address, never a folded or
 * case-insensitive comparison, so 'zukauskas@' never finds 'žukauskas@'.
 */
export async function findAccountByEmail(
  db: Executor,
  email: EmailAddress,
): Promise<Account | undefined> {
  const rows = await db
    .select({ id: players.id, email: players.email })
    .from(players)
    .where(eq(players.email, email))
    .limit(1);
  return accountRows.parse(rows).map((row) => ({
    player: playerOf(row.id),
    email: stored(storedEmailAddress(row.email), 'players', row.id),
  }))[0];
}

/** Upserts players' settings by player. */
export async function savePlayerSettings(
  db: Executor,
  saved: readonly StoredPlayerSettings[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(playerSettings)
      .values(
        chunk.map((row) => ({
          playerId: keyOf(row.player, 'player'),
          locale: row.locale,
          role: row.role,
          lastTournamentId: row.lastTournament,
        })),
      )
      .onConflictDoUpdate({
        target: playerSettings.playerId,
        set: {
          locale: excluded(playerSettings.locale),
          role: excluded(playerSettings.role),
          lastTournamentId: excluded(playerSettings.lastTournamentId),
        },
      }),
  );
}

/** Every player's settings, by player. */
export async function listPlayerSettings(
  db: Executor,
): Promise<StoredPlayerSettings[]> {
  const rows = await db
    .select({
      player: playerSettings.playerId,
      locale: playerSettings.locale,
      role: playerSettings.role,
      lastTournament: playerSettings.lastTournamentId,
    })
    .from(playerSettings)
    .orderBy(asc(playerSettings.playerId));
  return settingsRows.parse(rows).map((row) => ({
    player: playerOf(row.player),
    locale: row.locale,
    role: row.role,
    lastTournament: row.lastTournament,
  }));
}

/** The tournaments the player plays (`tournament_players`), by id. */
export async function listPlayerTournaments(
  db: Executor,
  player: PlayerId,
): Promise<number[]> {
  const rows = await db
    .select({ tournament: tournamentPlayers.tournamentId })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.playerId, keyOf(player, 'player')))
    .orderBy(asc(tournamentPlayers.tournamentId));
  return z
    .array(z.object({ tournament: z.int() }))
    .parse(rows)
    .map(({ tournament }) => tournament);
}

/**
 * R-28: the tournament the player used last ("Žaisti", joining from its
 * form), or none ("Keisti turnyrą"). Every account has its settings row
 * (createAccount, the reader); a player without one is a programmer error.
 */
export async function setLastTournament(
  db: Executor,
  player: PlayerId,
  tournament: number | null,
): Promise<void> {
  const saved = await db
    .update(playerSettings)
    .set({ lastTournamentId: tournament })
    .where(eq(playerSettings.playerId, keyOf(player, 'player')))
    .returning({ player: playerSettings.playerId });
  if (saved.length === 0) {
    throw new Error('setLastTournament: the player has no settings');
  }
}
