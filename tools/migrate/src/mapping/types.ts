import type { TournamentSnapshot } from '@sportbet/db';
import type {
  GameId,
  PlayerId,
  PointsRows,
  StoredPlayer,
  StoredPlayerSettings,
  TeamId,
  TournamentProfile,
} from '@sportbet/domain';
import type { TableCount } from './ledger';

/** One tournament's rows, mapped through sportbetColumns and the stored factories. */
export interface MappedTournament extends TournamentSnapshot {
  /** Production's own points rows: the parity oracle, and an input. */
  readonly production: PointsRows;
  /** The tournament's leagues, each with its loaded members (parity rankings). */
  readonly leagues: readonly League[];
  /** The points rows the parity checker cannot compare. */
  readonly refusedPoints: RefusedPoints;
  /** The hub's profile (slice 5), through sportbetColumns.tournamentProfile. */
  readonly profile: TournamentProfile;
}

/** A league of a tournament and its members, as `league_members` holds them. */
export interface League {
  readonly id: number;
  readonly members: readonly PlayerId[];
}

/**
 * The keys of a tournament's points rows the parity checker cannot compare,
 * as the class `refused`: a row whose game, team, round and player loaded
 * but which did not load itself - a points row the map refused, or a
 * prediction or standings row it refused, which the new code never scores
 * and sportbet does - and each game whose odds rows it refused, which the
 * new code scores at CO-5's 1.0 and sportbet at one of those rows. Keys
 * hold a player's id; the report only counts them.
 */
export interface RefusedPoints {
  readonly matches: readonly {
    readonly player: PlayerId;
    readonly game: GameId;
  }[];
  readonly standings: readonly {
    readonly player: PlayerId;
    readonly team: TeamId;
  }[];
  /** sportbet's `point_survivals` ids. */
  readonly survival: readonly number[];
  readonly odds: readonly GameId[];
}

export interface Mapped {
  /** Every loaded player: the id, the username and the account. */
  readonly players: readonly StoredPlayer[];
  /** Each loaded player's settings (user_settings: role from the admin level, locale). */
  readonly settings: readonly StoredPlayerSettings[];
  readonly tournaments: readonly MappedTournament[];
  readonly tables: readonly TableCount[];
  /** Quirks that were loaded as they are, each worth knowing about. */
  readonly notices: readonly string[];
}
