import {
  fillInCountInvariant,
  personNameInvariant,
  PlayerStatus,
  storedEmailAddress,
  tournamentId,
  usernameInvariant,
  type PlayerId,
  type RuleSet,
  type StoredPlayer,
  type Tournament,
  type TournamentId,
  type TournamentStatusRow,
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
  z.object({
    id: z.int(),
    username: usernameInvariant.schema,
    email: z.string(),
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
  }),
);

const statusRows = z.array(
  z.object({
    player: z.int(),
    tournament: z.int(),
    switchedOff: z.boolean(),
    adminHidden: z.boolean(),
    fillIns: fillInCountInvariant.schema,
  }),
);

/** Upserts players by id: the username and the account. */
export async function savePlayers(
  db: Executor,
  saved: readonly StoredPlayer[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(players)
      .overridingSystemValue()
      .values(
        chunk.map(({ id, username, email, name, surname }) => ({
          id: keyOf(id, 'player'),
          username,
          email,
          name,
          surname,
        })),
      )
      .onConflictDoUpdate({
        target: players.id,
        set: {
          username: excluded(players.username),
          email: excluded(players.email),
          name: excluded(players.name),
          surname: excluded(players.surname),
        },
      }),
  );
}

/** Every player, by id, with their account. */
export async function listPlayers(db: Executor): Promise<StoredPlayer[]> {
  const rows = await db
    .select({
      id: players.id,
      username: players.username,
      email: players.email,
      name: players.name,
      surname: players.surname,
    })
    .from(players)
    .orderBy(asc(players.id));
  return playerRows.parse(rows).map((row) => ({
    id: playerOf(row.id),
    username: row.username,
    email: stored(storedEmailAddress(row.email), 'players', row.id),
    name: row.name,
    surname: row.surname,
  }));
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

const statusLockRows = z.array(
  z.object({
    tournament: z.int(),
    switchedOff: z.boolean(),
    adminHidden: z.boolean(),
    fillIns: fillInCountInvariant.schema,
  }),
);

/**
 * The player's tournament_players rows, locked (FOR UPDATE) in tournament
 * id order, for a writer that reads them and writes some back - the one
 * lock order every writer of a player's statuses keeps, so two of them
 * never wait on each other crosswise (lockTournamentForRecalculation's
 * order): the tournament's recalculation lock (a writer that
 * recalculates), the game row (a result write FOR NO KEY UPDATE, a
 * prediction save FOR SHARE), the player's match_predictions row, then
 * these, in tournament id order; saveResult locks several players' rows in
 * player id order. savePrediction and saveResult use it; slice 9's fill-in
 * writer must too. Inside a transaction only: the locks end with it.
 */
export async function lockPlayerStatuses(
  tx: Executor,
  player: PlayerId,
): Promise<TournamentStatusRow[]> {
  const rows = statusLockRows.parse(
    await tx
      .select({
        tournament: tournamentPlayers.tournamentId,
        switchedOff: tournamentPlayers.switchedOff,
        adminHidden: tournamentPlayers.adminHidden,
        fillIns: tournamentPlayers.fillIns,
      })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.playerId, keyOf(player, 'player')))
      .orderBy(asc(tournamentPlayers.tournamentId))
      .for('update'),
  );
  return rows.map((row) => ({
    tournament: stored(
      tournamentId(String(row.tournament)),
      'tournament_players',
      row.tournament,
    ),
    switchedOff: row.switchedOff,
    adminHidden: row.adminHidden,
    fillIns: row.fillIns,
  }));
}
