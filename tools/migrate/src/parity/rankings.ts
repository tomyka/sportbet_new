import {
  rankPlayers,
  sportbetRules,
  type PlayerId,
  type PlayerStatus,
  type TournamentId,
  type TournamentTotal,
} from '@sportbet/domain';
import type { League } from '../map';

/** One row of sportbet's own leaderboard (sportbet-app.ts). */
export interface OldAppRank {
  readonly league: number;
  readonly player: PlayerId;
  readonly rank: number;
  /** The total sportbet ranks by, to the cent (issue #229). */
  readonly totalCents: number;
}

/** A player's place on one side. */
export interface Placed {
  readonly rank: number;
  readonly totalCents: number;
}

/** A player whose rank or total differs; null where one side lists them not. */
export interface RankDifference {
  readonly player: PlayerId;
  readonly username: string;
  readonly newCode: Placed | null;
  readonly oldApp: Placed | null;
}

export interface LeagueRanking {
  readonly league: number;
  /** Players listed on either side. */
  readonly players: number;
  readonly differences: readonly RankDifference[];
}

export interface RankingsInput {
  /** The tournament the leagues belong to. */
  readonly tournament: TournamentId;
  readonly leagues: readonly League[];
  /** The new code's totals under sportbetRules (recalculateTournament's). */
  readonly totals: readonly TournamentTotal[];
  /**
   * Each player's status under sportbetRules (the db's loadPlayerStatuses):
   * the domain says who is listed (RA-4).
   */
  readonly statuses: ReadonlyMap<PlayerId, PlayerStatus>;
  readonly usernames: ReadonlyMap<PlayerId, string>;
  readonly oldApp: readonly OldAppRank[];
}

/**
 * Spec 4: for every league, the domain's league table over the new code's
 * sportbet totals against sportbet's own (PointController::getAllUserPoints
 * with every member visible, then Ranking): rank and total per player. Only
 * oracle (b)'s ranking is compared, as a ranking over stale rows is stale
 * too. Pure.
 */
export function compareRankings(
  input: RankingsInput,
): readonly LeagueRanking[] {
  const totalOf = new Map(input.totals.map((total) => [total.player, total]));
  const nameOf = (player: PlayerId) => {
    const name = input.usernames.get(player);
    if (name === undefined)
      throw new Error('rankings: a player has no username');
    return name;
  };
  return input.leagues.map((league) => {
    const ranked = rankPlayers(
      league.members.map((player) => {
        const total = totalOf.get(player);
        const status = input.statuses.get(player);
        if (total === undefined || status === undefined) {
          // Every league member is a player of the tournament (mapSportbet),
          // and recalculateTournament totals every player.
          throw new Error('rankings: a league member has no total');
        }
        return {
          ...total,
          username: nameOf(player),
          listed: status.isListedIn(input.tournament, sportbetRules),
        };
      }),
      'league-table',
      sportbetRules,
    );
    const newCode = new Map(
      ranked.map((row) => [
        row.player,
        { rank: row.rank, totalCents: row.totalCents },
      ]),
    );
    const oldApp = new Map(
      input.oldApp
        .filter((row) => row.league === league.id)
        .map((row) => [
          row.player,
          { rank: row.rank, totalCents: row.totalCents },
        ]),
    );
    const players = [...new Set([...newCode.keys(), ...oldApp.keys()])];
    const differences = players.flatMap((player): RankDifference[] => {
      const ours = newCode.get(player) ?? null;
      const theirs = oldApp.get(player) ?? null;
      return ours?.rank === theirs?.rank &&
        ours?.totalCents === theirs?.totalCents
        ? []
        : [{ player, username: nameOf(player), newCode: ours, oldApp: theirs }];
    });
    return { league: league.id, players: players.length, differences };
  });
}
