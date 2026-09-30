import {
  PlayerStatus,
  tournamentId,
  usernameInvariant,
  type PlayerId,
  type RuleSet,
  type StoredPlayer,
  type Tournament,
  type TournamentId,
} from '@sportbet/domain';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { excluded, inChunks, keyOf, playerOf, stored } from '../edge';
import { players, tournamentPlayers } from './schema';

/** A player of one tournament, and the status scoring needs there. */
export interface TournamentPlayer {
  readonly player: PlayerId;
  readonly switchedOff: boolean;
  readonly adminHidden: boolean;
  readonly fillIns: number;
}

const playerRows = z.array(
  z.object({ id: z.int(), username: usernameInvariant.schema }),
);

const statusRows = z.array(
  z.object({
    player: z.int(),
    tournament: z.int(),
    switchedOff: z.boolean(),
    adminHidden: z.boolean(),
    fillIns: z.int(),
  }),
);

/** Upserts players by id: the id and the username, nothing else. */
export async function savePlayers(
  db: Executor,
  saved: readonly StoredPlayer[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(players)
      .overridingSystemValue()
      .values(
        chunk.map(({ id, username }) => ({
          id: keyOf(id, 'player'),
          username,
        })),
      )
      .onConflictDoUpdate({
        target: players.id,
        set: { username: excluded(players.username) },
      }),
  );
}

/** Every player, by id. */
export async function listPlayers(db: Executor): Promise<StoredPlayer[]> {
  const rows = await db
    .select({ id: players.id, username: players.username })
    .from(players)
    .orderBy(asc(players.id));
  return playerRows
    .parse(rows)
    .map(({ id, username }) => ({ id: playerOf(id), username }));
}

/** Upserts the tournament's players by player. */
export async function saveTournamentPlayers(
  db: Executor,
  tournament: Tournament,
  saved: readonly TournamentPlayer[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(tournamentPlayers)
      .values(
        chunk.map((row) => ({
          tournamentId: tournament.id,
          playerId: keyOf(row.player, 'player'),
          switchedOff: row.switchedOff,
          adminHidden: row.adminHidden,
          fillIns: row.fillIns,
        })),
      )
      .onConflictDoUpdate({
        target: [tournamentPlayers.tournamentId, tournamentPlayers.playerId],
        set: {
          switchedOff: excluded(tournamentPlayers.switchedOff),
          adminHidden: excluded(tournamentPlayers.adminHidden),
          fillIns: excluded(tournamentPlayers.fillIns),
        },
      }),
  );
}

/** The tournament's players, by id: everyone who gets a total. */
export async function listTournamentPlayers(
  db: Executor,
  tournament: Tournament,
): Promise<PlayerId[]> {
  const rows = await db
    .select({ player: tournamentPlayers.playerId })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournament.id))
    .orderBy(asc(tournamentPlayers.playerId));
  return z
    .array(z.object({ player: z.int() }))
    .parse(rows)
    .map(({ player }) => playerOf(player));
}

/**
 * Each of the tournament's players' status through PlayerStatus.stored,
 * built from all of their tournaments' rows: switched off where
 * `switched_off`, the fill-ins counted per tournament (which the sportbet
 * set adds up into its one lifetime count), hidden as this tournament's row
 * says.
 */
export async function loadPlayerStatuses(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<Map<PlayerId, PlayerStatus>> {
  const ofTournament = db
    .select({ player: tournamentPlayers.playerId })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournament.id));
  const rows = await db
    .select({
      player: tournamentPlayers.playerId,
      tournament: tournamentPlayers.tournamentId,
      switchedOff: tournamentPlayers.switchedOff,
      adminHidden: tournamentPlayers.adminHidden,
      fillIns: tournamentPlayers.fillIns,
    })
    .from(tournamentPlayers)
    .where(inArray(tournamentPlayers.playerId, ofTournament))
    .orderBy(
      asc(tournamentPlayers.playerId),
      asc(tournamentPlayers.tournamentId),
    );
  const byPlayer = new Map<number, z.infer<typeof statusRows>>();
  for (const row of statusRows.parse(rows)) {
    byPlayer.set(row.player, [...(byPlayer.get(row.player) ?? []), row]);
  }
  const keyOfTournament = (id: number): TournamentId =>
    stored(tournamentId(String(id)), 'tournament_players', id);
  const statuses = new Map<PlayerId, PlayerStatus>();
  for (const [player, own] of byPlayer) {
    statuses.set(
      playerOf(player),
      stored(
        PlayerStatus.stored(
          {
            switchedOffIn: new Set(
              own
                .filter((row) => row.switchedOff)
                .map((row) => keyOfTournament(row.tournament)),
            ),
            adminHidden:
              own.find((row) => row.tournament === tournament.id)
                ?.adminHidden ?? false,
            fillIns: new Map(
              own.map((row) => [keyOfTournament(row.tournament), row.fillIns]),
            ),
          },
          rules,
        ),
        'tournament_players',
        player,
      ),
    );
  }
  return statuses;
}
