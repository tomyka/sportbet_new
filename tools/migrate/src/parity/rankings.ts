import type { SavedLeague } from '@sportbet/db';
import {
  leaderboardRows,
  leagueRoster,
  listedPlayers,
  rankPlayers,
  sportbetRules,
  type PlayerId,
  type PlayerStatus,
  type PointsRows,
  type TournamentId,
  type TournamentTotal,
} from '@sportbet/domain';

/**
 * The two viewer levels sportbet ranks a league at (LeagueRoster::visibleTo):
 * every member visible (the highest guest level, a guest's view), and full
 * members only (level 0, a full member's and the tournament page's).
 */
export const GUEST_LEVELS = ['every-member', 'full-member'] as const;
export type GuestLevel = (typeof GUEST_LEVELS)[number];

/** One row of sportbet's own leaderboard (sportbet-app.ts). */
export interface OldAppRank {
  readonly league: number;
  readonly level: GuestLevel;
  readonly player: PlayerId;
  readonly rank: number;
  /** The total sportbet ranks by, to the cent (issue #229). */
  readonly totalCents: number;
}

/** One row of sportbet's own /leaderboard (sportbet-app.ts). */
export interface OldAppBoardRank {
  readonly player: PlayerId;
  readonly rank: number;
  /** The total sportbet ranks by, to the cent. */
  readonly totalCents: number;
}

/** A player's place on one side. */
export interface Placed {
  readonly rank: number;
  readonly totalCents: number;
}

/** A player whose rank or total differs; null where one side lists them not. */
interface RankDifference {
  readonly player: PlayerId;
  readonly username: string;
  readonly newCode: Placed | null;
  readonly oldApp: Placed | null;
}

export interface LeagueRanking {
  readonly league: number;
  readonly level: GuestLevel;
  /** Players listed on either side. */
  readonly players: number;
  readonly differences: readonly RankDifference[];
}

export interface RankingsInput {
  /** The tournament the leagues belong to. */
  readonly tournament: TournamentId;
  /** The tournament's leagues as sportbet holds them, with their members' guest flags. */
  readonly leagues: readonly SavedLeague[];
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
 * Spec 4: for every league, at both viewer levels (GUEST_LEVELS), the
 * domain's league table over the new code's sportbet totals of the league's
 * roster at that level (leagueRoster: listed, and no more a guest than the
 * viewer) against sportbet's own (PointController::getAllUserPoints at
 * PHP_INT_MAX and at 0, then Ranking): rank and total per player. Only
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
  return input.leagues.flatMap(({ league, members }) =>
    GUEST_LEVELS.map((level): LeagueRanking => {
      const roster = leagueRoster({
        members,
        statuses: input.statuses,
        viewerIsGuest: level === 'every-member',
        tournament: input.tournament,
        rules: sportbetRules,
      });
      const ranked = rankPlayers(
        [...roster].map((player) => {
          const total = totalOf.get(player);
          if (total === undefined) {
            // Every league member is a player of the tournament (mapSportbet),
            // and recalculateTournament totals every player.
            throw new Error('rankings: a league member has no total');
          }
          return { ...total, username: nameOf(player), listed: true };
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
          .filter((row) => row.league === league.id && row.level === level)
          .map((row) => [
            row.player,
            { rank: row.rank, totalCents: row.totalCents },
          ]),
      );
      return {
        league: league.id,
        level,
        ...compared(newCode, oldApp, nameOf),
      };
    }),
  );
}

/** Each side's places compared: the players on either, and those that differ. */
function compared(
  newCode: ReadonlyMap<PlayerId, Placed>,
  oldApp: ReadonlyMap<PlayerId, Placed>,
  nameOf: (player: PlayerId) => string,
): { readonly players: number; readonly differences: RankDifference[] } {
  const players = [...new Set([...newCode.keys(), ...oldApp.keys()])];
  const differences = players.flatMap((player): RankDifference[] => {
    const ours = newCode.get(player) ?? null;
    const theirs = oldApp.get(player) ?? null;
    return ours?.rank === theirs?.rank &&
      ours?.totalCents === theirs?.totalCents
      ? []
      : [{ player, username: nameOf(player), newCode: ours, oldApp: theirs }];
  });
  return { players: players.length, differences };
}

export interface LeaderboardInput {
  /** Each loaded tournament's new-code rows under sportbetRules, and its players' statuses. */
  readonly tournaments: readonly {
    readonly tournament: TournamentId;
    readonly points: Pick<PointsRows, 'matches' | 'standings' | 'survival'>;
    readonly statuses: ReadonlyMap<PlayerId, PlayerStatus>;
    /** sportbet's `is_public`; sportbetRules counts a non-public one too. */
    readonly isPublic: boolean;
  }[];
  readonly usernames: ReadonlyMap<PlayerId, string>;
  readonly oldApp: readonly OldAppBoardRank[];
}

export interface LeaderboardRanking {
  /** Players listed on either side. */
  readonly players: number;
  readonly differences: readonly RankDifference[];
}

/**
 * The domain's /leaderboard over the new code's sportbet rows of every
 * loaded tournament (leaderboardRows under sportbetRules: match + serija,
 * one account-wide switch) against sportbet's own (PlayerTotals::allTime
 * over the same tournaments, ranked): rank and total per player. Pure.
 */
export function compareLeaderboard(
  input: LeaderboardInput,
): LeaderboardRanking {
  const nameOf = (player: PlayerId) => {
    const name = input.usernames.get(player);
    if (name === undefined)
      throw new Error('rankings: a player has no username');
    return name;
  };
  const rows = leaderboardRows({
    tournaments: input.tournaments.map(
      ({ tournament, points, statuses, isPublic }) => ({
        rows: points,
        listed: listedPlayers(statuses, tournament, sportbetRules),
        // Only the ranks and totals are compared, never the winners column.
        predictions: [],
        isPublic,
      }),
    ),
    usernames: input.usernames,
    rules: sportbetRules,
  });
  return compared(
    new Map(
      rows.map((row) => [
        row.player,
        { rank: row.rank, totalCents: row.totalCents },
      ]),
    ),
    new Map(
      input.oldApp.map((row) => [
        row.player,
        { rank: row.rank, totalCents: row.totalCents },
      ]),
    ),
    nameOf,
  );
}
