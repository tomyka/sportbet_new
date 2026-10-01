import {
  roundNumber,
  type GameId,
  type PlayerId,
  type RoundNumber,
  type TeamId,
  type Tournament,
} from '@sportbet/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, stored } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { games, rounds } from '../season/schema';
import { teams } from '../team/schema';

/** The ids of the tournament's games, as a subquery to scope a statement by. */
export const gamesOf = (db: Executor, tournament: Tournament) =>
  db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.tournamentId, tournament.id));

/** The ids of the tournament's teams, as a subquery to scope a statement by. */
export const teamsOf = (db: Executor, tournament: Tournament) =>
  db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.tournamentId, tournament.id));

const ids = z.array(z.object({ id: z.int() }));
const roundRows = z.array(z.object({ id: z.int(), number: z.int() }));

/**
 * Which rows are one tournament's own: its rounds (each round number's
 * database id), teams, games and players (`tournament_players`), read once
 * from the database. Every save checks each row it is handed against it,
 * before it writes anything. A row that names a round, team, game or player
 * of no tournament or of another one is a programmer error - the caller
 * built the rows from the tournament's own - so each check throws, naming
 * the save, the stray id and the tournament, the same way everywhere.
 */
export class TournamentScope {
  readonly tournament: Tournament;
  readonly #roundIds: ReadonlyMap<RoundNumber, number>;
  readonly #teamKeys: ReadonlySet<number>;
  readonly #gameKeys: ReadonlySet<number>;
  readonly #playerKeys: ReadonlySet<number>;

  private constructor(
    tournament: Tournament,
    roundIds: ReadonlyMap<RoundNumber, number>,
    teamKeys: ReadonlySet<number>,
    gameKeys: ReadonlySet<number>,
    playerKeys: ReadonlySet<number>,
  ) {
    this.tournament = tournament;
    this.#roundIds = roundIds;
    this.#teamKeys = teamKeys;
    this.#gameKeys = gameKeys;
    this.#playerKeys = playerKeys;
  }

  /** The tournament's rounds, teams, games and players as the database holds them. */
  static async read(
    db: Executor,
    tournament: Tournament,
  ): Promise<TournamentScope> {
    const roundResult = await db
      .select({ id: rounds.id, number: rounds.number })
      .from(rounds)
      .where(eq(rounds.tournamentId, tournament.id));
    const playerResult = await db
      .select({ id: tournamentPlayers.playerId })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournament.id));
    const keys = (rows: unknown) =>
      new Set(ids.parse(rows).map(({ id }) => id));
    return new TournamentScope(
      tournament,
      new Map(
        roundRows
          .parse(roundResult)
          .map(({ id, number }) => [
            stored(roundNumber(number), 'rounds', id),
            id,
          ]),
      ),
      keys(await teamsOf(db, tournament)),
      keys(await gamesOf(db, tournament)),
      keys(playerResult),
    );
  }

  /** The database id of the tournament's round `round`, or a thrown stray. */
  roundId(round: RoundNumber, save: string): number {
    const id = this.#roundIds.get(round);
    if (id === undefined) this.#stray(save, 'round', String(round));
    return id;
  }

  /** The key of the tournament's team `team`, or a thrown stray. */
  team(team: TeamId, save: string): number {
    const key = keyOf(team, 'team');
    if (!this.#teamKeys.has(key)) this.#stray(save, 'team', team);
    return key;
  }

  /** The tournament's game `game`, or a thrown stray. */
  game(game: GameId, save: string): GameId {
    if (!this.#gameKeys.has(game)) this.#stray(save, 'game', String(game));
    return game;
  }

  /** The key of the tournament's player `player`, or a thrown stray. */
  player(player: PlayerId, save: string): number {
    const key = keyOf(player, 'player');
    if (!this.#playerKeys.has(key)) this.#stray(save, 'player', player);
    return key;
  }

  /** Whether `player` is one of the tournament's players. */
  hasPlayer(player: PlayerId): boolean {
    return this.#playerKeys.has(keyOf(player, 'player'));
  }

  #stray(save: string, what: string, id: string): never {
    throw new Error(
      `${save}: ${what} ${id} is not a ${what} of tournament ${String(this.tournament.id)}`,
    );
  }
}
